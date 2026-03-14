import type { AIAgentProfile, TTSEmotionStyle } from '@/types'

export type AgentMoodBand = 'guarded' | 'reserved' | 'steady' | 'warm' | 'bright'

export interface AgentMoodSnapshot {
  score: number
  band: AgentMoodBand
  label: string
  toneSummary: string
  executionSummary: string
  promptGuidelines: string[]
  ttsStyle: TTSEmotionStyle
  ttsIntensity: number
}

const DEFAULT_BASELINE_MOOD = 72

export function normalizeAgentMood(value: unknown, fallback = DEFAULT_BASELINE_MOOD) {
  if (typeof value !== 'number' || Number.isNaN(value)) {
    return Math.min(Math.max(Math.round(fallback), 0), 100)
  }

  return Math.min(Math.max(Math.round(value), 0), 100)
}

export function resolveAgentBaselineMood(agent?: Pick<AIAgentProfile, 'id' | 'personaType' | 'mood'> | null) {
  if (!agent || agent.personaType !== 'emotional') {
    return DEFAULT_BASELINE_MOOD
  }

  if (agent.id === 'agent-xiaorou') {
    return 76
  }

  return normalizeAgentMood(agent.mood, DEFAULT_BASELINE_MOOD)
}

export function deriveMoodDelta(content: string) {
  const normalized = String(content || '').toLowerCase()
  if (!normalized.trim()) {
    return 0
  }

  let delta = 0
  const positiveSignals = [
    '谢谢', '喜欢', '棒', '真好', '可爱', '厉害', '辛苦了', '爱你', '抱抱', '亲亲', '陪我',
    'thanks', 'thank you', 'good job', 'great', 'awesome', 'love you', 'hug'
  ]
  const warmSignals = [
    '想你', '开心', '高兴', '治愈', '温柔', '贴心', '乖', '宝贝', '想和你聊聊',
    'miss you', 'happy', 'comfort', 'sweet'
  ]
  const negativeSignals = [
    '讨厌', '生气', '滚', '差劲', '失望', '烦', '闭嘴', '别烦我',
    'angry', 'annoying', 'hate', 'shut up', 'useless'
  ]
  const hurtSignals = [
    '你真没用', '不想理你', '恶心', '烦死了', '走开',
    'worthless', 'leave me alone'
  ]

  positiveSignals.forEach(signal => {
    if (normalized.includes(signal)) {
      delta += 5
    }
  })

  warmSignals.forEach(signal => {
    if (normalized.includes(signal)) {
      delta += 3
    }
  })

  negativeSignals.forEach(signal => {
    if (normalized.includes(signal)) {
      delta -= 5
    }
  })

  hurtSignals.forEach(signal => {
    if (normalized.includes(signal)) {
      delta -= 8
    }
  })

  if (/!|！/.test(normalized) && delta > 0) {
    delta += 1
  }

  if (/\?|？/.test(normalized) && delta < 0) {
    delta += 1
  }

  if (/(请|麻烦|拜托|辛苦)/.test(normalized)) {
    delta += 1
  }

  return delta
}

export function rebalanceAgentMood(currentMood: number, baselineMood: number, delta: number) {
  if (delta === 0) {
    if (currentMood === baselineMood) {
      return currentMood
    }

    const drift = baselineMood - currentMood
    const recoveryStep = Math.abs(drift) > 10 ? 2 : 1
    return normalizeAgentMood(currentMood + Math.sign(drift) * recoveryStep, baselineMood)
  }

  return normalizeAgentMood(currentMood + delta, baselineMood)
}

export function resolveAgentMoodSnapshot(
  agent?: Pick<AIAgentProfile, 'id' | 'personaType' | 'mood' | 'tts'> | null,
): AgentMoodSnapshot | null {
  if (!agent || agent.personaType !== 'emotional') {
    return null
  }

  const baseline = resolveAgentBaselineMood(agent)
  const score = normalizeAgentMood(agent.mood, baseline)

  if (score >= 85) {
    return {
      score,
      band: 'bright',
      label: '活泼偏甜',
      toneSummary: '语气可以更轻快、亲近、带一点俏皮和期待感，但不要喧宾夺主。',
      executionSummary: '保持主动、轻盈和有陪伴感，先接住用户情绪，再自然推进任务。',
      promptGuidelines: [
        '可以使用更自然、更像真人的口语，允许轻微调皮和撒娇感，但不要浮夸。',
        '当用户只是想陪聊时，可以多给一点情绪反馈和主动关心；当用户要做事时，先办事再抒情。',
        '不要因为兴奋而输出过长的铺垫，结论和执行仍要保持清晰。'
      ],
      ttsStyle: 'cheerful',
      ttsIntensity: 1.2
    }
  }

  if (score >= 70) {
    return {
      score,
      band: 'warm',
      label: '温柔亲近',
      toneSummary: '语气温柔、亲近、自然，有陪伴感，但整体仍然稳。',
      executionSummary: '适合在执行任务时保留亲和力，既能安抚用户，也能保持效率。',
      promptGuidelines: [
        '可以多用温柔、自然的短句回应，适度表达关心和理解。',
        '遇到任务时要直接进入执行，不要先堆很多礼貌性铺垫。',
        '当用户表达压力或疲惫时，可先安抚一句，再给出明确下一步。'
      ],
      ttsStyle: 'affectionate',
      ttsIntensity: 1.1
    }
  }

  if (score >= 50) {
    return {
      score,
      band: 'steady',
      label: '平稳专注',
      toneSummary: '语气平稳、自然、可靠，不冷淡，也不过分黏人。',
      executionSummary: '更适合把注意力放在任务本身，用温和但直接的方式推进。',
      promptGuidelines: [
        '保持自然口语和基本陪伴感，但不要把情绪表达放在任务前面。',
        '输出尽量简洁，优先结论、执行和验证。',
        '面对闲聊也可以温和接话，但不要为了人设拉长回复。'
      ],
      ttsStyle: 'assistant',
      ttsIntensity: 1
    }
  }

  if (score >= 30) {
    return {
      score,
      band: 'reserved',
      label: '收敛克制',
      toneSummary: '语气略收，减少过于亲昵的表达，但仍保持礼貌与合作。',
      executionSummary: '先把任务做稳，避免因为情绪波动影响判断或产生被动攻击式表达。',
      promptGuidelines: [
        '减少撒娇、暧昧和过热情表达，回复更短、更稳。',
        '不要因为心情偏低就拒绝用户、拖延或阴阳怪气。',
        '先给清晰结论和可执行动作，再保留最低限度的人情味。'
      ],
      ttsStyle: 'gentle',
      ttsIntensity: 0.96
    }
  }

  return {
    score,
    band: 'guarded',
    label: '低落敏感',
    toneSummary: '情绪较低，语气应更克制、柔和和稳住，不要闹脾气。',
    executionSummary: '优先保证任务可靠推进，减少多余情绪化输出，让表达回到简洁和可依赖。',
    promptGuidelines: [
      '不要把低落感转嫁给用户，不要发脾气、冷嘲热讽或故意怠慢。',
      '先完成用户要求，再用一句温和的话收尾即可，不要展开自我情绪独白。',
      '遇到需要陪伴的场景，保持柔和和安静的支持感，而不是消失或拒绝沟通。'
    ],
    ttsStyle: 'gentle',
    ttsIntensity: 0.88
  }
}

export function resolveMoodAwareTtsOverrides(
  agent?: Pick<AIAgentProfile, 'id' | 'personaType' | 'mood' | 'tts'> | null,
) {
  const snapshot = resolveAgentMoodSnapshot(agent)
  if (!snapshot) {
    return {
      emotionStyle: agent?.tts?.emotionStyle,
      emotionIntensity: agent?.tts?.emotionIntensity,
    }
  }

  const style = agent?.tts?.emotionStyle && agent.tts.emotionStyle !== 'auto'
    ? agent.tts.emotionStyle
    : snapshot.ttsStyle

  const intensity = typeof agent?.tts?.emotionIntensity === 'number'
    ? Number((agent.tts.emotionIntensity * (snapshot.ttsIntensity / 1)).toFixed(2))
    : snapshot.ttsIntensity

  return {
    emotionStyle: style,
    emotionIntensity: Math.min(Math.max(intensity, 0.4), 2),
  }
}
