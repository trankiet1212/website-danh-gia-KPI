import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router';
import { ToastProvider } from './components/common/toast';
import { router } from './app/router';
import { ApiClientError, setUnauthenticatedHandler } from './lib/api-client';
import { ME_KEY } from './lib/auth';
import './styles/globals.css';

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
      // Không thử lại khi lỗi do quyền/dữ liệu (4xx) — chỉ thử lại lỗi mạng/máy chủ.
      retry: (count, err) =>
        !(err instanceof ApiClientError && err.status >= 400 && err.status < 500) && count < 2,
    },
  },
});

// Phiên hết hạn/bị thu hồi ở bất kỳ request nào → xóa thông tin đăng nhập, guard tự chuyển về trang đăng nhập.
setUnauthenticatedHandler(() => {
  if (queryClient.getQueryData(ME_KEY)) queryClient.setQueryData(ME_KEY, null);
});

const rootElement = document.getElementById('root');
if (!rootElement) throw new Error('Không tìm thấy phần tử #root trong index.html');

createRoot(rootElement).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <RouterProvider router={router} />
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>,
);
