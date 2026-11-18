import type { Metadata } from 'next'
import { AntdRegistry } from '@ant-design/nextjs-registry'
import { ConfigProvider } from 'antd'
import zhCN from 'antd/locale/zh_CN'
import './globals.css'
import PlatformNav from '@/components/PlatformNav'
import { APP_NAME, APP_DESCRIPTION } from '@/lib/branding'

export const metadata: Metadata = {
  title: APP_NAME,
  description: APP_DESCRIPTION,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>
        <AntdRegistry>
          <ConfigProvider
            locale={zhCN}
            theme={{
              token: {
                colorPrimary: '#2563eb',
                colorBgLayout: '#f6f7f9',
                colorBgContainer: '#ffffff',
                borderRadius: 8,
                fontFamily: "-apple-system, 'PingFang SC', 'Microsoft YaHei', sans-serif",
              },
              components: {
                Card: { paddingLG: 20 },
                Table: { headerBg: '#fafbfc', headerColor: '#6b7280', fontSize: 13 },
              },
            }}
          >
            <div className="flex h-screen">
              <PlatformNav />
              <main className="flex-1 min-w-0 overflow-hidden bg-[#f6f7f9]">{children}</main>
            </div>
          </ConfigProvider>
        </AntdRegistry>
      </body>
    </html>
  )
}
