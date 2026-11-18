'use client'

import { useState } from 'react'
import {
  Drawer,
  Form,
  Input,
  Select,
  Button,
  Table,
  Space,
  Popconfirm,
  Tabs,
  message,
  Tag,
  Collapse,
  Badge,
} from 'antd'
import { PlusOutlined, EditOutlined, DeleteOutlined, AimOutlined, SearchOutlined, NodeIndexOutlined, MinusCircleOutlined } from '@ant-design/icons'
import { v4 as uuidv4 } from 'uuid'
import {
  TopologyData,
  SystemNode,
  SystemRelation,
  SystemCategory,
  SystemLayer,
  SystemContact,
  BusinessLineConfig,
  BusinessLineGroupConfig,
  DomainDef,
  buildDomainMaps,
  RelationType,
  EnvType,
  EnvStatus,
  categoryToLayer,
  nodeLayer,
  LAYER_LABELS,
  LAYER_COLORS,
  APP_TYPE_LABELS,
  RELATION_LABELS,
  CONTRACT_KIND_LABELS,
  ENV_LABELS,
  STATUS_LABELS,
  STATUS_COLORS,
  buildBusinessLineMaps,
} from '@/types'

interface Props {
  data: TopologyData
  onChange: (data: TopologyData) => void
  selectedNodeId?: string | null
  onLocateNode?: (nodeId: string) => void
  onFocusEgo?: (nodeId: string) => void
}

export default function ConfigPanel({ data, onChange, selectedNodeId, onLocateNode, onFocusEgo }: Props) {
  const domainMaps = buildDomainMaps(data)
  const [nodeDrawerOpen, setNodeDrawerOpen] = useState(false)
  const [edgeDrawerOpen, setEdgeDrawerOpen] = useState(false)
  const [blDrawerOpen, setBlDrawerOpen] = useState(false)
  const [blGroupDrawerOpen, setBlGroupDrawerOpen] = useState(false)
  const [editingNode, setEditingNode] = useState<SystemNode | null>(null)
  const [editingRelation, setEditingRelation] = useState<SystemRelation | null>(null)
  const [editingBl, setEditingBl] = useState<BusinessLineConfig | null>(null)
  const [editingBlGroup, setEditingBlGroup] = useState<BusinessLineGroupConfig | null>(null)
  const [nodeSearch, setNodeSearch] = useState('')
  const [relationSearch, setRelationSearch] = useState('')
  const [nodeForm] = Form.useForm()
  const [edgeForm] = Form.useForm()
  const [blForm] = Form.useForm()
  const [blGroupForm] = Form.useForm()

  const blMaps = buildBusinessLineMaps(data)
  const businessLines = data.businessLines || []
  const businessLineGroups = data.businessLineGroups || []

  const blOptions = Object.entries(blMaps.labels).map(([value, label]) => ({ value, label }))

  const handleAddNode = () => {
    setEditingNode(null)
    nodeForm.resetFields()
    setNodeDrawerOpen(true)
  }

  const handleEditNode = (node: SystemNode) => {
    setEditingNode(node)
    const values: Record<string, unknown> = { ...node }
    const linkKeys = ['repo', 'ones', 'wiki', 'ci', 'monitoring'] as const
    linkKeys.forEach((k) => { values[`links_${k}`] = node.links?.[k] })
    const envFields = ['status', 'url', 'deployUrl', 'version', 'replicas', 'notes'] as const
    const envTypes: EnvType[] = ['dev', 'test', 'staging', 'production']
    envTypes.forEach((env) => {
      const info = node.environments?.[env]
      envFields.forEach((f) => { values[`env_${env}_${f}`] = info?.[f] })
    })
    nodeForm.setFieldsValue(values)
    setNodeDrawerOpen(true)
  }

  const handleDeleteNode = (id: string) => {
    const newNodes = data.nodes.filter((n) => n.id !== id)
    const newRelations = data.relations.filter((r) => r.source !== id && r.target !== id)
    onChange({ ...data, nodes: newNodes, relations: newRelations })
    message.success('已删除')
  }

  const handleNodeSubmit = () => {
    nodeForm.validateFields().then((values) => {
      const environments: SystemNode['environments'] = {}
      const envTypes: EnvType[] = ['dev', 'test', 'staging', 'production']

      envTypes.forEach((env) => {
        const status = values[`env_${env}_status`]
        if (status) {
          environments[env] = {
            status,
            url: values[`env_${env}_url`] || undefined,
            deployUrl: values[`env_${env}_deployUrl`] || undefined,
            version: values[`env_${env}_version`] || undefined,
            replicas: values[`env_${env}_replicas`] ? Number(values[`env_${env}_replicas`]) : undefined,
            notes: values[`env_${env}_notes`] || undefined,
          }
        }
      })

      const links: SystemNode['links'] = {}
      if (values.links_repo) links.repo = values.links_repo
      if (values.links_ones) links.ones = values.links_ones
      if (values.links_wiki) links.wiki = values.links_wiki
      if (values.links_ci) links.ci = values.links_ci
      if (values.links_monitoring) links.monitoring = values.links_monitoring

      const cleanValues = {
        name: values.name,
        category: (categoryToLayer(values.layer as SystemLayer) || 'application') as SystemCategory,
        appType: values.appType || undefined,
        businessLine: values.businessLine || undefined,
        layer: values.layer || undefined,
        description: values.description,
        owner: values.owner,
        vendor: values.vendor || undefined,
        contacts: ((values.contacts as SystemContact[] | undefined) || []).filter((c) => c && c.name && c.name.trim()) || undefined,
        url: values.url,
        links: Object.keys(links).length > 0 ? links : undefined,
        environments: Object.keys(environments).length > 0 ? environments : undefined,
      }

      let newNodes: SystemNode[]
      if (editingNode) {
        newNodes = data.nodes.map((n) =>
          n.id === editingNode.id ? { ...n, ...cleanValues } : n
        )
      } else {
        const newNode: SystemNode = {
          id: values.id || uuidv4().slice(0, 8),
          ...cleanValues,
        }
        newNodes = [...data.nodes, newNode]
      }
      onChange({ ...data, nodes: newNodes })
      setNodeDrawerOpen(false)
      message.success(editingNode ? '已更新' : '已添加')
    })
  }

  const handleAddRelation = () => {
    setEditingRelation(null)
    edgeForm.resetFields()
    setEdgeDrawerOpen(true)
  }

  const handleEditRelation = (relation: SystemRelation) => {
    setEditingRelation(relation)
    edgeForm.setFieldsValue({
      ...relation,
      contract_kind: relation.contract?.kind,
      contract_target: relation.contract?.target,
      contract_note: relation.contract?.note,
    })
    setEdgeDrawerOpen(true)
  }

  const handleDeleteRelation = (id: string) => {
    const newRelations = data.relations.filter((r) => r.id !== id)
    onChange({ ...data, relations: newRelations })
    message.success('已删除')
  }

  const handleRelationSubmit = () => {
    edgeForm.validateFields().then((values) => {
      const contract = values.contract_kind || values.contract_target || values.contract_note
        ? {
            kind: values.contract_kind || undefined,
            target: values.contract_target || undefined,
            note: values.contract_note || undefined,
          }
        : undefined
      const clean = {
        source: values.source,
        target: values.target,
        relationType: values.relationType,
        label: values.label || undefined,
        description: values.description || undefined,
        environments: values.environments?.length ? values.environments : undefined,
        contract,
      }
      let newRelations: SystemRelation[]
      if (editingRelation) {
        newRelations = data.relations.map((r) =>
          r.id === editingRelation.id ? { ...r, ...clean } : r
        )
      } else {
        const newRelation: SystemRelation = {
          id: uuidv4().slice(0, 8),
          ...clean,
        }
        newRelations = [...data.relations, newRelation]
      }
      onChange({ ...data, relations: newRelations })
      setEdgeDrawerOpen(false)
      message.success(editingRelation ? '已更新' : '已添加')
    })
  }

  const nodeColumns = [
    {
      title: '名称',
      dataIndex: 'name',
      key: 'name',
      width: 100,
      sorter: (a: SystemNode, b: SystemNode) => a.name.localeCompare(b.name),
    },
    {
      title: '层级',
      key: 'layer',
      width: 80,
      render: (_: unknown, record: SystemNode) => {
        const layer = nodeLayer(record)
        return layer ? <Tag color={LAYER_COLORS[layer]}>{LAYER_LABELS[layer]}</Tag> : <span className="text-gray-300">-</span>
      },
    },
    {
      title: '环境',
      key: 'envs',
      width: 100,
      render: (_: unknown, record: SystemNode) => {
        if (!record.environments) return <span className="text-gray-300">-</span>
        const envs = Object.entries(record.environments) as [EnvType, { status: EnvStatus }][]
        return (
          <Space size={2} wrap>
            {envs.map(([env, info]) => (
              <Badge
                key={env}
                color={STATUS_COLORS[info.status]}
                text={<span className="text-xs">{ENV_LABELS[env]}</span>}
              />
            ))}
          </Space>
        )
      },
    },
    {
      title: '操作',
      key: 'action',
      width: 100,
      render: (_: unknown, record: SystemNode) => (
        <Space>
          <Button type="link" size="small" icon={<AimOutlined />} title="定位到图上" onClick={() => onLocateNode?.(record.id)} />
          <Button type="link" size="small" icon={<NodeIndexOutlined />} title="上下游聚焦图" onClick={() => onFocusEgo?.(record.id)} />
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditNode(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteNode(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const nodeNameMap = new Map(data.nodes.map((n) => [n.id, n.name]))
  const getNodeName = (id: string) => nodeNameMap.get(id) || id

  const relationColumns = [
    {
      title: '来源',
      dataIndex: 'source',
      key: 'source',
      width: 100,
      render: (id: string) => getNodeName(id),
    },
    {
      title: '关系',
      dataIndex: 'relationType',
      key: 'relationType',
      width: 80,
      render: (type: RelationType) => RELATION_LABELS[type],
    },
    {
      title: '目标',
      dataIndex: 'target',
      key: 'target',
      width: 100,
      render: (id: string) => getNodeName(id),
    },
    {
      title: '环境',
      key: 'envs',
      width: 110,
      render: (_: unknown, record: SystemRelation) => {
        const envs = record.environments || []
        if (envs.length === 0) return <span className="text-gray-300">全部</span>
        return (
          <Space size={2} wrap>
            {envs.map((e) => <Tag key={e} className="!text-[10px] !px-1 !py-0">{ENV_LABELS[e]}</Tag>)}
          </Space>
        )
      },
    },
    {
      title: '说明',
      dataIndex: 'description',
      key: 'description',
      ellipsis: true,
      render: (d?: string) => d || <span className="text-gray-300">-</span>,
    },
    {
      title: '操作',
      key: 'action',
      width: 80,
      render: (_: unknown, record: SystemRelation) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditRelation(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteRelation(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const nodeOptions = data.nodes.map((n) => ({ label: n.name, value: n.id }))

  const handleAddBl = () => {
    setEditingBl(null)
    blForm.resetFields()
    blForm.setFieldsValue({ color: '#1677ff' })
    setBlDrawerOpen(true)
  }
  const handleEditBl = (bl: BusinessLineConfig) => {
    setEditingBl(bl)
    blForm.setFieldsValue(bl)
    setBlDrawerOpen(true)
  }
  const handleDeleteBl = (id: string) => {
    const newBls = businessLines.filter((b) => b.id !== id)
    const newGroups = businessLineGroups.map((g) => ({
      ...g,
      children: g.children.filter((c) => c !== id),
    })).filter((g) => g.children.length > 0)
    onChange({ ...data, businessLines: newBls, businessLineGroups: newGroups })
    message.success('已删除')
  }
  const handleBlSubmit = () => {
    blForm.validateFields().then((values) => {
      let newBls: BusinessLineConfig[]
      if (editingBl) {
        newBls = businessLines.map((b) => b.id === editingBl.id ? { ...b, ...values, id: editingBl.id } : b)
        if (values.group !== editingBl.group) {
          let newGroups = businessLineGroups.map((g) => ({
            ...g,
            children: g.children.filter((c) => c !== editingBl.id),
          }))
          if (values.group) {
            newGroups = newGroups.map((g) => g.id === values.group ? { ...g, children: [...g.children, editingBl.id] } : g)
          }
          onChange({ ...data, businessLines: newBls, businessLineGroups: newGroups.filter((g) => g.children.length > 0) })
        } else {
          onChange({ ...data, businessLines: newBls })
        }
      } else {
        const newBl: BusinessLineConfig = { ...values }
        newBls = [...businessLines, newBl]
        let newGroups = [...businessLineGroups]
        if (values.group) {
          newGroups = newGroups.map((g) => g.id === values.group ? { ...g, children: [...g.children, values.id] } : g)
        }
        onChange({ ...data, businessLines: newBls, businessLineGroups: newGroups })
      }
      setBlDrawerOpen(false)
      message.success(editingBl ? '已更新' : '已添加')
    })
  }

  const handleAddBlGroup = () => {
    setEditingBlGroup(null)
    blGroupForm.resetFields()
    blGroupForm.setFieldsValue({ color: '#1677ff', children: [] })
    setBlGroupDrawerOpen(true)
  }
  const handleEditBlGroup = (g: BusinessLineGroupConfig) => {
    setEditingBlGroup(g)
    blGroupForm.setFieldsValue(g)
    setBlGroupDrawerOpen(true)
  }
  const handleDeleteBlGroup = (id: string) => {
    const newGroups = businessLineGroups.filter((g) => g.id !== id)
    const removedGroup = businessLineGroups.find((g) => g.id === id)
    const newBls = businessLines.map((b) =>
      removedGroup?.children.includes(b.id) ? { ...b, group: undefined } : b
    )
    onChange({ ...data, businessLines: newBls, businessLineGroups: newGroups })
    message.success('已删除')
  }
  const handleBlGroupSubmit = () => {
    blGroupForm.validateFields().then((values) => {
      let newGroups: BusinessLineGroupConfig[]
      if (editingBlGroup) {
        newGroups = businessLineGroups.map((g) => g.id === editingBlGroup.id ? { ...g, ...values, id: editingBlGroup.id } : g)
      } else {
        newGroups = [...businessLineGroups, values as BusinessLineGroupConfig]
      }
      const groupedChildren = new Set(newGroups.flatMap((g) => g.children))
      const newBls = businessLines.map((b) => {
        if (groupedChildren.has(b.id)) {
          const parentGroup = newGroups.find((g) => g.children.includes(b.id))
          return { ...b, group: parentGroup?.id }
        }
        return { ...b, group: undefined }
      })
      onChange({ ...data, businessLines: newBls, businessLineGroups: newGroups })
      setBlGroupDrawerOpen(false)
      message.success(editingBlGroup ? '已更新' : '已添加')
    })
  }

  const domainColumns = [
    {
      title: '图标', dataIndex: 'icon', key: 'icon', width: 60,
      render: (icon?: string) => <span className="text-base">{icon || '-'}</span>,
    },
    {
      title: '名称', dataIndex: 'name', key: 'name', width: 120,
      render: (name: string, record: DomainDef) => <Tag color={record.color}>{name}</Tag>,
    },
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100 },
    { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '业务流数', key: 'flows', width: 90,
      render: (_: unknown, record: DomainDef) =>
        (data.businessFlows || []).filter((f) => f.domain === record.id).length,
    },
  ]

  const blColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 110 },
    {
      title: '名称', dataIndex: 'name', key: 'name', width: 90,
      render: (name: string, record: BusinessLineConfig) => (
        <Tag color={record.color}>{name}</Tag>
      ),
    },
    { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
    { title: '负责人', dataIndex: 'owner', key: 'owner', width: 80 },
    {
      title: '分组', key: 'group', width: 80,
      render: (_: unknown, record: BusinessLineConfig) => {
        const g = businessLineGroups.find((g) => g.children.includes(record.id))
        return g ? <Tag>{g.name}</Tag> : <span className="text-gray-300">-</span>
      },
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: unknown, record: BusinessLineConfig) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditBl(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteBl(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const blGroupColumns = [
    { title: 'ID', dataIndex: 'id', key: 'id', width: 100 },
    {
      title: '名称', dataIndex: 'name', key: 'name', width: 90,
      render: (name: string, record: BusinessLineGroupConfig) => (
        <Tag color={record.color}>{name}</Tag>
      ),
    },
    { title: '说明', dataIndex: 'description', key: 'description', ellipsis: true },
    {
      title: '子业务线', dataIndex: 'children', key: 'children',
      render: (children: string[]) => (
        <Space size={2} wrap>
          {children.map((c) => <Tag key={c} className="text-xs">{blMaps.labels[c] || c}</Tag>)}
        </Space>
      ),
    },
    {
      title: '操作', key: 'action', width: 80,
      render: (_: unknown, record: BusinessLineGroupConfig) => (
        <Space>
          <Button type="link" size="small" icon={<EditOutlined />} onClick={() => handleEditBlGroup(record)} />
          <Popconfirm title="确定删除？" onConfirm={() => handleDeleteBlGroup(record.id)}>
            <Button type="link" size="small" danger icon={<DeleteOutlined />} />
          </Popconfirm>
        </Space>
      ),
    },
  ]

  const envFormItems = (env: EnvType) => (
    <div className="grid grid-cols-2 gap-x-3">
      <Form.Item name={`env_${env}_status`} label="状态" className="mb-2">
        <Select
          allowClear
          placeholder="选择状态"
          size="small"
          options={Object.entries(STATUS_LABELS).map(([v, l]) => ({ value: v, label: l }))}
        />
      </Form.Item>
      <Form.Item name={`env_${env}_version`} label="版本" className="mb-2">
        <Input size="small" placeholder="如: v1.2.3" />
      </Form.Item>
      <Form.Item name={`env_${env}_url`} label="访问地址" className="mb-2 col-span-2">
        <Input size="small" placeholder="https://app-test.example.com" />
      </Form.Item>
      <Form.Item name={`env_${env}_deployUrl`} label="部署地址" className="mb-2 col-span-2">
        <Input size="small" placeholder="如: http://k8s-dashboard/namespace/deploy" />
      </Form.Item>
      <Form.Item name={`env_${env}_replicas`} label="实例数" className="mb-2">
        <Input size="small" type="number" placeholder="如: 3" />
      </Form.Item>
      <Form.Item name={`env_${env}_notes`} label="备注" className="mb-2">
        <Input size="small" placeholder="备注" />
      </Form.Item>
    </div>
  )

  const filteredNodes = nodeSearch
    ? data.nodes.filter((n) => {
        const kw = nodeSearch.toLowerCase()
        return n.name.toLowerCase().includes(kw) || n.id.toLowerCase().includes(kw) || (n.owner && n.owner.toLowerCase().includes(kw))
      })
    : data.nodes

  const filteredRelations = relationSearch
    ? data.relations.filter((r) => {
        const kw = relationSearch.toLowerCase()
        const srcName = getNodeName(r.source).toLowerCase()
        const tgtName = getNodeName(r.target).toLowerCase()
        return srcName.includes(kw) || tgtName.includes(kw) || (r.label && r.label.toLowerCase().includes(kw))
      })
    : data.relations

  return (
    <div className="h-full flex flex-col">
      <Tabs
        size="small"
        className="flex-1 flex flex-col [&_.ant-tabs-content]:flex-1 [&_.ant-tabs-content]:min-h-0 [&_.ant-tabs-tabpane]:h-full"
        items={[
          {
            key: 'nodes',
            label: `系统/应用 (${data.nodes.length})`,
            children: (
              <div className="h-full flex flex-col">
                <div className="mb-3 flex items-center gap-2 flex-shrink-0">
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddNode} size="small">
                    添加系统
                  </Button>
                  <Input
                    placeholder="搜索节点..."
                    prefix={<SearchOutlined className="text-gray-400" />}
                    value={nodeSearch}
                    onChange={(e) => setNodeSearch(e.target.value)}
                    allowClear
                    size="small"
                    className="w-[160px]"
                  />
                </div>
                {selectedNodeId && (
                  <Button
                    block
                    type="primary"
                    ghost
                    icon={<NodeIndexOutlined />}
                    size="small"
                    className="mb-3"
                    onClick={() => onFocusEgo?.(selectedNodeId)}
                  >
                    查看「{data.nodes.find((n) => n.id === selectedNodeId)?.name || selectedNodeId}」的上下游聚焦图
                  </Button>
                )}
                <div className="flex-1 min-h-0">
                  <Table
                    dataSource={filteredNodes}
                    columns={nodeColumns}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
                    scroll={{ y: 'calc(100vh - 260px)' }}
                    rowClassName={(record) => record.id === selectedNodeId ? 'bg-blue-50' : ''}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'relations',
            label: `关系 (${data.relations.length})`,
            children: (
              <div className="h-full flex flex-col">
                <div className="mb-3 flex items-center gap-2 flex-shrink-0">
                  <Button type="primary" icon={<PlusOutlined />} onClick={handleAddRelation} size="small">
                    添加关系
                  </Button>
                  <Input
                    placeholder="搜索关系..."
                    prefix={<SearchOutlined className="text-gray-400" />}
                    value={relationSearch}
                    onChange={(e) => setRelationSearch(e.target.value)}
                    allowClear
                    size="small"
                    className="w-[160px]"
                  />
                </div>
                <div className="flex-1 min-h-0">
                  <Table
                    dataSource={filteredRelations}
                    columns={relationColumns}
                    rowKey="id"
                    size="small"
                    pagination={{ pageSize: 20, size: 'small', showSizeChanger: false }}
                    scroll={{ y: 'calc(100vh - 260px)' }}
                  />
                </div>
              </div>
            ),
          },
          {
            key: 'businessLines',
            label: `业务线 (${businessLines.length})`,
            children: (
              <div className="h-full flex flex-col gap-3">
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium">业务线分组</span>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddBlGroup} size="small">添加分组</Button>
                  </div>
                  <Table dataSource={businessLineGroups} columns={blGroupColumns} rowKey="id" size="small" pagination={false} />
                </div>
                <div>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-sm font-medium">业务线</span>
                    <Button type="primary" icon={<PlusOutlined />} onClick={handleAddBl} size="small">添加业务线</Button>
                  </div>
                  <Table dataSource={businessLines} columns={blColumns} rowKey="id" size="small" pagination={false} />
                </div>
              </div>
            ),
          },
          {
            key: 'domains',
            label: `业务域 (${domainMaps.domains.length})`,
            children: (
              <div className="h-full flex flex-col gap-3">
                <div className="p-2 bg-blue-50 border border-blue-100 rounded text-xs text-blue-600 leading-relaxed">
                  业务域词表由数据文件 domains[] 定义（未声明时回退内置默认），此处为只读展示。
                  如需新增或调整业务域，请修改数据文件的 domains 字段。
                </div>
                <Table dataSource={domainMaps.domains} columns={domainColumns} rowKey="id" size="small" pagination={false} />
              </div>
            ),
          },
        ]}
      />

      <Drawer
        title={editingNode ? '编辑系统' : '添加系统'}
        open={nodeDrawerOpen}
        onClose={() => setNodeDrawerOpen(false)}
        width={520}
        extra={
          <Button type="primary" onClick={handleNodeSubmit}>
            保存
          </Button>
        }
      >
        <Form form={nodeForm} layout="vertical" size="small">
          {!editingNode && (
            <Form.Item
              name="id"
              label="系统ID"
              rules={[
                { required: true, message: '请输入系统ID（英文）' },
                {
                  validator: (_, value: string) =>
                    value && data.nodes.some((n) => n.id === value)
                      ? Promise.reject(new Error('该系统ID已存在，请换一个'))
                      : Promise.resolve(),
                },
              ]}
            >
              <Input placeholder="如: my-system" />
            </Form.Item>
          )}
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如: 费控系统" />
            </Form.Item>
            <Form.Item name="layer" label="架构分层" rules={[{ required: true, message: '请选择架构分层' }]}>
              <Select placeholder="选择分层" options={Object.entries(LAYER_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="appType" label="应用类型">
              <Select allowClear placeholder="选择应用类型" options={Object.entries(APP_TYPE_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="businessLine" label="业务线">
              <Select allowClear placeholder="选择业务线" options={blOptions} />
            </Form.Item>
          </div>
          <Form.Item name="description" label="描述" rules={[{ required: true, message: '请输入描述' }]}>
            <Input.TextArea rows={2} placeholder="系统的职责和功能描述" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="owner" label="负责人/团队（内部）">
              <Input placeholder="如: 平台组" />
            </Form.Item>
            <Form.Item name="url" label="访问地址">
              <Input placeholder="如: https://example.com" />
            </Form.Item>
            <Form.Item name="vendor" label="供应商/外部方" tooltip="仅外部系统填写，owner 请填内部团队">
              <Input placeholder="如: 汇联易 / 用友" />
            </Form.Item>
          </div>

          <Form.Item label="联系人">
            <Form.List name="contacts">
              {(fields, { add, remove }) => (
                <div className="space-y-2">
                  {fields.map(({ key, name, ...rest }) => (
                    <div key={key} className="relative rounded-lg border border-gray-200 p-2 pt-4">
                      <button
                        type="button"
                        className="absolute top-1 right-1 text-gray-300 hover:text-red-500"
                        onClick={() => remove(name)}
                        aria-label="删除联系人"
                      >
                        <MinusCircleOutlined />
                      </button>
                      <div className="grid grid-cols-2 gap-x-2 gap-y-0">
                        <Form.Item {...rest} name={[name, 'name']} label="姓名" className="!mb-1">
                          <Input size="small" placeholder="姓名" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'role']} label="角色/职务" className="!mb-1">
                          <Input size="small" placeholder="如: 客户经理 / 技术支持" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'phone']} label="电话" className="!mb-1">
                          <Input size="small" placeholder="手机 / 座机" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'email']} label="邮箱" className="!mb-1">
                          <Input size="small" placeholder="name@company.com" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'im']} label="IM/企业微信" className="!mb-1">
                          <Input size="small" placeholder="企业微信 / 微信 / 其他" />
                        </Form.Item>
                        <Form.Item {...rest} name={[name, 'note']} label="备注" className="!mb-1">
                          <Input size="small" placeholder="服务时间 / 工单渠道等" />
                        </Form.Item>
                      </div>
                    </div>
                  ))}
                  <Button type="dashed" size="small" icon={<PlusOutlined />} onClick={() => add({ name: '' })} block>
                    添加联系人
                  </Button>
                </div>
              )}
            </Form.List>
          </Form.Item>

          <Collapse
            size="small"
            className="mt-2"
            defaultActiveKey={['links']}
            items={[
              {
                key: 'links',
                label: '相关链接',
                children: (
                  <div className="grid grid-cols-1 gap-0">
                    <Form.Item name="links_repo" label="代码仓库" className="mb-2">
                      <Input size="small" placeholder="如: https://example.com/git/group/project"  />
                    </Form.Item>
                    <Form.Item name="links_ones" label="ONES 地址" className="mb-2">
                      <Input size="small" placeholder="如: https://example.com/ones/project/xxx"  />
                    </Form.Item>
                    <Form.Item name="links_wiki" label="文档/Wiki" className="mb-2">
                      <Input size="small" placeholder="如: https://example.com/wiki/pages/xxx"  />
                    </Form.Item>
                    <Form.Item name="links_ci" label="CI/CD 流水线" className="mb-2">
                      <Input size="small" placeholder="如: https://example.com/ci/pipeline/xxx"  />
                    </Form.Item>
                    <Form.Item name="links_monitoring" label="监控面板" className="mb-2">
                      <Input size="small" placeholder="如: https://example.com/grafana/d/xxx"  />
                    </Form.Item>
                  </div>
                ),
              },
              ...([
                ['dev', '开发环境'],
                ['test', '测试环境'],
                ['staging', '预发环境'],
                ['production', '生产环境'],
              ] as [EnvType, string][]).map(([env, label]) => ({
                key: env,
                label: (
                  <span className="flex items-center gap-2">
                    <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: STATUS_COLORS[nodeForm.getFieldValue(`env_${env}_status`) as EnvStatus] || '#d9d9d9' }} />
                    {label}
                  </span>
                ),
                children: envFormItems(env),
              })),
            ]}
          />
        </Form>
      </Drawer>

      <Drawer
        title={editingRelation ? '编辑关系' : '添加关系'}
        open={edgeDrawerOpen}
        onClose={() => setEdgeDrawerOpen(false)}
        width={400}
        extra={
          <Button type="primary" onClick={handleRelationSubmit}>
            保存
          </Button>
        }
      >
        <Form form={edgeForm} layout="vertical">
          <Form.Item name="source" label="来源系统" rules={[{ required: true, message: '请选择来源' }]}>
            <Select options={nodeOptions} showSearch optionFilterProp="label" placeholder="选择来源系统" />
          </Form.Item>
          <Form.Item
            name="target"
            label="目标系统"
            dependencies={['source']}
            rules={[
              { required: true, message: '请选择目标' },
              ({ getFieldValue }) => ({
                validator: (_, value: string) =>
                  value && value === getFieldValue('source')
                    ? Promise.reject(new Error('来源与目标不能是同一系统（自环）'))
                    : Promise.resolve(),
              }),
            ]}
          >
            <Select options={nodeOptions} showSearch optionFilterProp="label" placeholder="选择目标系统" />
          </Form.Item>
          <Form.Item name="relationType" label="关系类型" rules={[{ required: true, message: '请选择关系类型' }]}>
            <Select options={Object.entries(RELATION_LABELS).map(([value, label]) => ({ value, label }))} />
          </Form.Item>
          <Form.Item name="label" label="标签说明">
            <Input placeholder="如: 费用单据同步" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-3">
            <Form.Item name="contract_kind" label="契约类型">
              <Select allowClear placeholder="如 HTTP 接口" options={Object.entries(CONTRACT_KIND_LABELS).map(([value, label]) => ({ value, label }))} />
            </Form.Item>
            <Form.Item name="contract_target" label="契约标识">
              <Input placeholder="接口路径 / 方法 / topic / 表名" />
            </Form.Item>
          </div>
          <Form.Item name="contract_note" label="契约备注">
            <Input placeholder="如: 仅生产环境 / 灰度接口" />
          </Form.Item>
          <Form.Item name="description" label="详细描述">
            <Input.TextArea rows={2} placeholder="关系的详细说明" />
          </Form.Item>
          <Form.Item name="environments" label="适用环境">
            <Select
              mode="multiple"
              placeholder="选择该关系存在的环境（不选则所有环境都有）"
              options={Object.entries(ENV_LABELS).map(([value, label]) => ({ value, label }))}
            />
          </Form.Item>
        </Form>
      </Drawer>

      <Drawer
        title={editingBl ? '编辑业务线' : '添加业务线'}
        open={blDrawerOpen}
        onClose={() => setBlDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" onClick={handleBlSubmit}>保存</Button>}
      >
        <Form form={blForm} layout="vertical" size="small">
          {!editingBl && (
            <Form.Item name="id" label="业务线ID" rules={[{ required: true, message: '请输入ID（英文）' }]}>
              <Input placeholder="如: cost-control" />
            </Form.Item>
          )}
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如: 协同办公线" />
            </Form.Item>
            <Form.Item name="color" label="颜色" rules={[{ required: true, message: '请选择颜色' }]}>
              <Input type="color" className="w-full h-8" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} placeholder="业务线的职责和范围" />
          </Form.Item>
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="owner" label="负责人">
              <Input placeholder="如: 平台组" />
            </Form.Item>
            <Form.Item name="group" label="所属分组">
              <Select
                allowClear
                placeholder="选择分组"
                options={businessLineGroups.map((g) => ({ value: g.id, label: g.name }))}
              />
            </Form.Item>
          </div>
        </Form>
      </Drawer>

      <Drawer
        title={editingBlGroup ? '编辑业务线分组' : '添加业务线分组'}
        open={blGroupDrawerOpen}
        onClose={() => setBlGroupDrawerOpen(false)}
        width={420}
        extra={<Button type="primary" onClick={handleBlGroupSubmit}>保存</Button>}
      >
        <Form form={blGroupForm} layout="vertical" size="small">
          {!editingBlGroup && (
            <Form.Item name="id" label="分组ID" rules={[{ required: true, message: '请输入分组ID（英文）' }]}>
              <Input placeholder="如: oa-group" />
            </Form.Item>
          )}
          <div className="grid grid-cols-2 gap-x-4">
            <Form.Item name="name" label="名称" rules={[{ required: true, message: '请输入名称' }]}>
              <Input placeholder="如: OA 大线" />
            </Form.Item>
            <Form.Item name="color" label="颜色" rules={[{ required: true, message: '请选择颜色' }]}>
              <Input type="color" className="w-full h-8" />
            </Form.Item>
          </div>
          <Form.Item name="description" label="说明">
            <Input.TextArea rows={2} placeholder="分组的描述信息" />
          </Form.Item>
          <Form.Item name="children" label="包含的业务线">
            <Select
              mode="multiple"
              placeholder="选择子业务线"
              options={businessLines.map((bl) => ({ value: bl.id, label: bl.name }))}
            />
          </Form.Item>
        </Form>
      </Drawer>
    </div>
  )
}
