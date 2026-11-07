import { ClipboardList, ArrowRight } from 'lucide-react';
import styles from './home-assessment-link.module.css';

export function HomeAssessmentLink() {
  return <a className={styles.card} href="/avaliacoes">
    <span className={styles.icon}><ClipboardList size={25} aria-hidden="true" /></span>
    <span className={styles.copy}><strong>Minha avaliação física</strong><span>Consulte suas medidas, orientações do professor e avaliações anteriores.</span></span>
    <span className={styles.action}>Ver avaliação <ArrowRight size={18} aria-hidden="true" /></span>
  </a>;
}
