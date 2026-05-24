import React from 'react'
import styles from './DangerModal.module.css'

interface Props {
  message: string
  onConfirm: () => void
  onCancel: () => void
}

export function DangerModal({ message, onConfirm, onCancel }: Props) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.panel} onClick={(e) => e.stopPropagation()}>
        <div className={styles.icon}>⚠</div>
        <h3 className={styles.title}>Destructive Operation</h3>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button className={styles.cancelBtn} onClick={onCancel}>Cancel</button>
          <button className={styles.confirmBtn} onClick={onConfirm}>Run Anyway</button>
        </div>
      </div>
    </div>
  )
}
