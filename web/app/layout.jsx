import './globals.css';

export const metadata = {
  title: 'Traffic Lab',
  description: '대규모 트래픽 상황에서 캐시, 커넥션 풀, 장애 대응이 어떻게 동작하는지 실시간으로 보는 실험실',
};

export default function RootLayout({ children }) {
  return (
    <html lang="ko">
      <body>{children}</body>
    </html>
  );
}
