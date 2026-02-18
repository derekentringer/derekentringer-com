import styles from "./ConfirmDialog.module.css";

interface ConfirmDialogProps {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  onCancel: () => void;
  isLoading?: boolean;
}

export function ConfirmDialog({
  title,
  message,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  onConfirm,
  onCancel,
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <div className={styles.overlay} onClick={onCancel}>
      <div className={styles.dialog} onClick={(e) => e.stopPropagation()}>
        <h2 className={styles.title}>{title}</h2>
        <p className={styles.message}>{message}</p>
        <div className={styles.actions}>
          <button
            className={styles.cancelButton}
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </button>
          <button
            className={styles.confirmButton}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? "Deleting..." : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
