import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { readAdminTestimonials, readPublishedTestimonials } from "../lib/testimonials.ts";

const admin = "00000000-0000-0000-0000-000000000001";
const member = "00000000-0000-0000-0000-000000000002";

test("public testimonial parsing keeps only bounded display fields", () => {
  const parsed = readPublishedTestimonials([
    {
      display_name: "Ana",
      display_label: "Aluna da musculação",
      quote: "O histórico me ajuda a acompanhar a constância dos meus treinos.",
      published_at: "2026-11-01T08:00:00.000Z",
      member_user_id: member,
      source_note: "private",
      consented_at: "2026-10-31T10:00:00.000Z",
    },
    {
      display_name: "Bia",
      display_label: null,
      quote: "curto",
      published_at: "2026-11-01T08:00:00.000Z",
    },
  ]);

  assert.deepEqual(parsed, [{
    displayName: "Ana",
    displayLabel: "Aluna da musculação",
    quote: "O histórico me ajuda a acompanhar a constância dos meus treinos.",
    publishedAt: "2026-11-01T08:00:00.000Z",
  }]);
  assert.equal("member_user_id" in parsed[0], false);
  assert.equal("consented_at" in parsed[0], false);
  assert.equal("source_note" in parsed[0], false);
});

test("admin testimonial parsing accepts drafts without inventing a publication date", () => {
  const parsed = readAdminTestimonials({ testimonials: [{
    id: 7,
    display_name: "Lia",
    display_label: null,
    quote: "Autorizei este relato real para a área do Summer PRO.",
    status: "draft",
    consented_at: "2026-10-31T11:00:00.000Z",
    consent_method: "whatsapp",
    created_at: "2026-11-01T08:00:00.000Z",
    published_at: null,
  }] });
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].publishedAt, "");
  assert.equal(parsed[0].status, "draft");
});

test("Postgres keeps consent private and permits only admins to publish", async () => {
  const db = new PGlite();
  await db.exec(`
    create role anon;
    create role authenticated;
    create schema auth;
    create schema summer_private;
    create table auth.users(
      id uuid primary key,
      email text,
      email_confirmed_at timestamptz,
      deleted_at timestamptz,
      created_at timestamptz default now()
    );
    create function auth.uid() returns uuid language sql stable as $$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid
    $$;
    insert into auth.users(id,email,email_confirmed_at) values
      ('${admin}','admin@example.test',now()),
      ('${member}','member@example.test',now());
    create function summer_private.is_admin() returns boolean
      language sql stable security definer set search_path = '' as $$
        select auth.uid() = '${admin}'::uuid
      $$;
    grant usage on schema auth, public to anon, authenticated;
    grant usage on schema summer_private to authenticated;
    grant execute on function auth.uid() to anon, authenticated;
    revoke all on function summer_private.is_admin() from public, anon;
    grant execute on function summer_private.is_admin() to authenticated;
  `);
  const migration = await readFile(
    new URL("../supabase/migrations/20261101093000_summer_testimonials.sql", import.meta.url),
    "utf8",
  );
  await db.exec(migration);

  async function asUser(id, role = "authenticated") {
    await db.exec(`reset role; set role ${role}; select set_config('request.jwt.claim.sub', '${id}', false);`);
  }
  async function scalar(sql) {
    return Object.values((await db.query(sql)).rows[0])[0];
  }

  const rls = await db.query(`
    select n.nspname, c.relname, c.relrowsecurity
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where (n.nspname, c.relname) in (
      ('summer_private', 'pro_testimonials'),
      ('public', 'summer_published_testimonials')
    )
    order by n.nspname
  `);
  assert.equal(rls.rows.length, 2);
  assert.ok(rls.rows.every(row => row.relrowsecurity));

  const functions = await db.query(`
    select n.nspname, p.proname, p.prosecdef
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where p.proname in (
      'summer_get_pro_testimonials',
      'summer_admin_testimonials',
      'summer_admin_create_testimonial',
      'summer_admin_set_testimonial_status',
      'admin_testimonials',
      'admin_create_testimonial',
      'admin_set_testimonial_status'
    )
  `);
  assert.ok(functions.rows.filter(row => row.nspname === "public").every(row => !row.prosecdef));
  assert.ok(functions.rows.filter(row => row.nspname === "summer_private").every(row => row.prosecdef));

  assert.equal(Number(await scalar("select count(*) from summer_private.pro_testimonials")), 0);

  await asUser(member);
  assert.deepEqual(await scalar("select public.summer_get_pro_testimonials()"), []);
  await assert.rejects(
    () => db.query("select * from summer_private.pro_testimonials"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query("select public.summer_admin_testimonials()"),
    /restrito/,
  );
  await assert.rejects(
    () => db.query(`select public.summer_admin_create_testimonial(
      'Ana', 'Aluna da musculação',
      'O histórico me ajuda a acompanhar a constância dos meus treinos.',
      now(), 'whatsapp', true, '${member}', 'mensagem privada'
    )`),
    /restrito/,
  );

  await asUser(admin);
  await assert.rejects(
    () => db.query(`select public.summer_admin_create_testimonial(
      'Ana', null, 'Este depoimento possui tamanho suficiente para o teste.',
      now(), 'whatsapp', false
    )`),
    /autorizacao expressa/,
  );
  await assert.rejects(
    () => db.query(`select public.summer_admin_create_testimonial(
      'Ana Maria Silva', null, 'Este depoimento possui tamanho suficiente para o teste.',
      now(), 'whatsapp', true
    )`),
    /primeiro nome/,
  );
  await assert.rejects(
    () => db.query(`select public.summer_admin_create_testimonial(
      'Ana', null, 'Este depoimento possui tamanho suficiente para o teste.',
      now() + interval '1 day', 'whatsapp', true
    )`),
    /futuro/,
  );

  const created = await scalar(`select public.summer_admin_create_testimonial(
    'Ana', 'Aluna da musculação',
    'O histórico me ajuda a acompanhar a constância dos meus treinos.',
    now() - interval '1 hour', 'whatsapp', true, '${member}', 'mensagem privada de origem'
  )`);
  assert.equal(created.status, "draft");
  assert.equal(created.display_name, "Ana");
  assert.equal(created.member_user_id, undefined);
  assert.equal(created.source_note, undefined);

  await asUser("", "anon");
  assert.deepEqual(await scalar("select public.summer_get_pro_testimonials()"), []);
  assert.equal((await db.query("select display_name, quote from public.summer_published_testimonials")).rows.length, 0);
  await assert.rejects(
    () => db.query("select testimonial_id from public.summer_published_testimonials"),
    /permission denied/,
  );
  await assert.rejects(
    () => db.query(`insert into public.summer_published_testimonials(testimonial_id,display_name,quote,published_at)
      values (1,'Falsa','Este texto não pode ser inserido pelo público.',now())`),
    /permission denied/,
  );

  await asUser(admin);
  const published = await scalar(`select public.summer_admin_set_testimonial_status(${created.id}, 'published')`);
  assert.equal(published.status, "published");

  await asUser("", "anon");
  const visible = await scalar("select public.summer_get_pro_testimonials()");
  assert.equal(visible.length, 1);
  assert.deepEqual(Object.keys(visible[0]).sort(), ["display_label", "display_name", "published_at", "quote"]);
  assert.equal(visible[0].display_name, "Ana");
  assert.equal(JSON.stringify(visible).includes(member), false);
  assert.equal(JSON.stringify(visible).includes("mensagem privada"), false);

  await asUser(member);
  await assert.rejects(
    () => db.query(`select public.summer_admin_set_testimonial_status(${created.id}, 'revoked')`),
    /restrito/,
  );

  await asUser(admin);
  const revoked = await scalar(`select public.summer_admin_set_testimonial_status(${created.id}, 'revoked')`);
  assert.equal(revoked.status, "revoked");
  await asUser("", "anon");
  assert.deepEqual(await scalar("select public.summer_get_pro_testimonials()"), []);

  await db.close();
});
