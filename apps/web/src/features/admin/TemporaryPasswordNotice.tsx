/** Hiển thị MỘT LẦN mật khẩu tạm vừa tạo — hệ thống không lưu và không hiển thị lại. */
import { Copy } from 'lucide-react';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

export function TemporaryPasswordNotice({
  username,
  password,
}: {
  username: string;
  password: string;
}) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="space-y-3 rounded-md border border-warning/50 bg-warning/10 p-4 text-sm">
      <p>
        Mật khẩu tạm của tài khoản <strong>{username}</strong> (chỉ hiển thị một lần — hãy giao trực
        tiếp cho người dùng, không gửi qua kênh không bảo mật):
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded bg-card px-3 py-1.5 font-mono text-base tracking-wider">
          {password}
        </code>
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true));
          }}
        >
          <Copy aria-hidden /> {copied ? 'Đã sao chép' : 'Sao chép'}
        </Button>
      </div>
      <p className="text-muted-foreground">
        Người dùng sẽ phải đổi mật khẩu ở lần đăng nhập đầu tiên.
      </p>
    </div>
  );
}
