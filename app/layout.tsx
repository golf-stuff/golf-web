// app/layout.tsx
// import './globals.css'; // 存在しないなら削除してOK

export const metadata = {
  title: 'Golf Score App',
  description: 'Golf scoring application',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="ja">
      <body>{children}</body>
    </html>
  );
}
