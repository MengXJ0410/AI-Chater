export const AI_TERMS = [
  "大模型", "推理", "向量", "Transformer", "Agent", "RAG", "微调", "神经网络",
  "提示词", "多模态", "知识图谱", "上下文", "注意力", "嵌入", "生成式 AI", "强化学习",
  "机器学习", "深度学习", "语义搜索", "工作流", "工具调用", "Token", "思维链", "模型对齐",
  "幻觉", "函数调用", "长上下文", "智能体", "数据集", "评测", "训练", "开源模型",
  "API", "云端推理", "本地模型", "实时响应", "语音识别", "视觉理解", "代码生成", "自动化",
];

export function pickAiTerms(count: number, random = Math.random) {
  const terms = [...AI_TERMS];
  for (let index = terms.length - 1; index > 0; index -= 1) {
    const selected = Math.floor(random() * (index + 1));
    [terms[index], terms[selected]] = [terms[selected], terms[index]];
  }
  return terms.slice(0, Math.min(count, terms.length));
}
