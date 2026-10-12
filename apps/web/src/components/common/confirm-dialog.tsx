/** Hộp thoại xác nhận thao tác quan trọng, có thể yêu cầu nhập lý do. */
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog } from '@/components/ui/dialog';
import { FormField, Textarea } from '@/components/ui/form-controls';
import { FormError } from './states';

interface ConfirmProps {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  pending?: boolean;
  error?: unknown;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

/** Nội dung chỉ tồn tại khi hộp thoại mở → lý do nhập tự xóa khi đóng. */
function ConfirmBody({
  confirmLabel = 'Xác nhận',
  destructive,
  requireReason,
  pending,
  error,
  onConfirm,
  onClose,
}: ConfirmProps) {
  const [reason, setReason] = useState('');
  const invalid = requireReason && reason.trim().length === 0;
  return (
    <div className="space-y-4">
      <FormError error={error} />
      {requireReason && (
        <FormField id="confirm-reason" label="Lý do" required>
          <Textarea
            id="confirm-reason"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            maxLength={500}
          />
        </FormField>
      )}
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onClose} disabled={pending}>
          Hủy
        </Button>
        <Button
          variant={destructive ? 'destructive' : 'default'}
          disabled={pending || invalid}
          onClick={() => onConfirm(reason.trim())}
        >
          {pending ? 'Đang xử lý...' : confirmLabel}
        </Button>
      </div>
    </div>
  );
}

export function ConfirmDialog(props: ConfirmProps) {
  return (
    <Dialog
      open={props.open}
      onClose={props.onClose}
      title={props.title}
      description={props.description}
      size="sm"
    >
      <ConfirmBody {...props} />
    </Dialog>
  );
}
