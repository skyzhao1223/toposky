'use client'

import { Popover, Button, Input, Typography } from 'antd'
import { UserOutlined } from '@ant-design/icons'
import type { AuthorInfo } from '@/hooks/useAuthor'

const { Text } = Typography

interface Props {
  author: AuthorInfo
  onChange: (patch: Partial<AuthorInfo>) => void
}

/**
 * 维护者身份控件：保存时作为 git 提交作者。
 * 信息保存在浏览器 localStorage（由 useAuthor 管理），一次填写长期有效。
 */
export default function AuthorControl({ author, onChange }: Props) {
  const content = (
    <div className="w-64 space-y-2">
      <Text type="secondary" className="text-xs">
        保存数据时将以此身份记录 git 提交（审计用），仅存于本浏览器。
      </Text>
      <div>
        <div className="text-xs text-gray-500 mb-1">姓名 / 工号</div>
        <Input
          size="small"
          placeholder="如：张三"
          value={author.name}
          onChange={(e) => onChange({ name: e.target.value })}
        />
      </div>
      <div>
        <div className="text-xs text-gray-500 mb-1">邮箱</div>
        <Input
          size="small"
          placeholder="如：you@example.com"
          value={author.email}
          onChange={(e) => onChange({ email: e.target.value })}
        />
      </div>
    </div>
  )

  return (
    <Popover content={content} title="维护者身份" trigger="click" placement="bottomRight">
      <Button size="small" icon={<UserOutlined />} type={author.name ? 'default' : 'dashed'}>
        {author.name || '设置身份'}
      </Button>
    </Popover>
  )
}
