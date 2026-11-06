import type {
  ActorRole,
  AuditEntry,
  CatalogItem,
  EnvRequest,
  EnvSpec,
  EnvStatus,
  Environment,
  LifecycleEvent,
  LifecycleStatus,
  Notification,
  Project,
  Provider,
  Quota,
  QuotaRequest,
  Role,
  Suggestion,
  Tenant,
  TestRun,
  UsagePoint,
  User,
} from './types'

/** Bump to discard everyone's saved state and load this seed. */
export const SEED_VERSION = 'v2'

export const DEFAULT_TENANT_ID = 't-default'
export const SUPER_ADMIN_ID = 'u-super'
export const SAMPLE_PASSWORD = 'demo123'

export const QUICK_SIGN_IN: { userId: string; label: string }[] = [
  { userId: 'u-super', label: 'Super Admin' },
  { userId: 'u-sl-ta', label: 'ShikshaLokam · Tenant Admin' },
  { userId: 'u-sl-dev', label: 'ShikshaLokam · User' },
  { userId: 'u-m4c-ta', label: 'Mantra4Change · Tenant Admin' },
  { userId: 'u-m4c-dev', label: 'Mantra4Change · User' },
]

/* ---------- deterministic helpers ---------- */

export function seededRandom(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function hashString(s: string) {
  let h = 2166136261
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

const DAY = 86_400_000

function at(days: number, hour = 10, minute = 0) {
  const d = new Date(Date.now() - days * DAY)
  d.setHours(hour, minute, 0, 0)
  if (d.getTime() > Date.now()) d.setTime(Date.now() - (days === 0 ? 20 * 60_000 : 0))
  return d.toISOString()
}

const hoursAgo = (h: number) => new Date(Date.now() - h * 3_600_000).toISOString()
const plusMinutes = (iso: string, m: number) => new Date(new Date(iso).getTime() + m * 60_000).toISOString()
const daysAhead = (days: number) => new Date(Date.now() + days * DAY).toISOString()

function apiKey(seed: string) {
  const rand = seededRandom(hashString(seed))
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = 'aic_live_'
  for (let i = 0; i < 32; i++) out += chars[Math.floor(rand() * chars.length)]
  return out
}

export function endpointFor(tenantCode: string, envId: string) {
  return `https://${tenantCode.toLowerCase()}.aicommons.example/v1/envs/${envId}`
}

const ev = (status: LifecycleStatus, when: string, actorId: string, actorRole: ActorRole, comment?: string): LifecycleEvent =>
  comment ? { status, at: when, actorId, actorRole, comment } : { status, at: when, actorId, actorRole }

/* ---------- tenants ---------- */

const SL = 't-shikshalokam'
const M4C = 't-mantra4change'

export const seedTenants: Tenant[] = [
  {
    id: DEFAULT_TENANT_ID,
    name: 'Default',
    code: 'SYS-000',
    description: 'System tenant for platform administration.',
    orgType: 'System',
    city: '—',
    state: '—',
    contactName: 'Platform Administrator',
    contactEmail: 'admin@sandbox.org',
    quota: { vcpu: 0, ramGb: 0, gpus: 0, storageGb: 0 },
    enabledItemIds: [],
    status: 'active',
    isSystem: true,
    createdAt: at(400),
  },
  {
    id: SL,
    name: 'ShikshaLokam',
    code: 'SLK-101',
    description: 'Works with education leaders and teachers to improve learning in government schools.',
    orgType: 'NGO',
    city: 'Bengaluru',
    state: 'Karnataka',
    contactName: 'Ramya Krishnan',
    contactEmail: 'tenantadmin@shikshalokam.org',
    quota: { vcpu: 128, ramGb: 512, gpus: 6, storageGb: 3000 },
    enabledItemIds: [
      'llm-gpt', 'llm-claude', 'llm-gemini', 'llm-llama', 'llm-mistral', 'llm-gemma', 'llm-sarvam',
      'asr-indicconformer', 'asr-bhashini', 'asr-sarvam', 'asr-whisper', 'asr-google', 'asr-azure',
      'cap-langgraph', 'cap-crewai', 'cap-llamaindex', 'cap-qdrant', 'cap-pgvector', 'cap-chroma',
      'cap-ragas', 'cap-deepeval', 'cap-promptfoo', 'cap-langflow',
    ],
    status: 'active',
    isSystem: false,
    createdAt: at(210),
  },
  {
    id: M4C,
    name: 'Mantra4Change',
    code: 'M4C-102',
    description: 'Partners with school leaders and state systems to build school improvement programmes.',
    orgType: 'NGO',
    city: 'Hyderabad',
    state: 'Telangana',
    contactName: 'Sneha Kulkarni',
    contactEmail: 'tenantadmin@mantra4change.org',
    quota: { vcpu: 96, ramGb: 384, gpus: 4, storageGb: 2000 },
    enabledItemIds: [
      'llm-gpt', 'llm-claude', 'llm-gemini', 'llm-mistral', 'llm-gemma', 'llm-sarvam',
      'asr-bhashini',
      'cap-langgraph', 'cap-crewai', 'cap-llamaindex', 'cap-weaviate', 'cap-pgvector',
      'cap-ragas', 'cap-promptfoo', 'cap-flowise', 'cap-haystack',
    ],
    status: 'active',
    isSystem: false,
    createdAt: at(160),
  },
]

/* ---------- users ---------- */

const u = (id: string, name: string, email: string, title: string, tenantId: string, role: Role, lastActive: string, status: User['status'] = 'active'): User => ({
  id,
  name,
  email,
  title,
  tenantId,
  role,
  status,
  lastActiveAt: lastActive,
})

export const seedUsers: User[] = [
  u(SUPER_ADMIN_ID, 'Platform Administrator', 'admin@sandbox.org', 'Super Admin', DEFAULT_TENANT_ID, 'super_admin', hoursAgo(2)),

  u('u-sl-ta', 'Ramya Krishnan', 'tenantadmin@shikshalokam.org', 'Programme technology lead', SL, 'tenant_admin', hoursAgo(3)),
  u('u-sl-dev', 'Arjun Rao', 'developer@shikshalokam.org', 'ML engineer', SL, 'user', hoursAgo(5)),
  u('u-sl-meera', 'Meera Iyer', 'meera.iyer@shikshalokam.org', 'Data scientist', SL, 'user', hoursAgo(26)),
  u('u-sl-kiran', 'Kiran Hegde', 'kiran.hegde@shikshalokam.org', 'Backend developer', SL, 'user', hoursAgo(50)),
  u('u-sl-fatima', 'Fatima Sheikh', 'fatima.sheikh@shikshalokam.org', 'Speech researcher', SL, 'user', hoursAgo(8)),
  u('u-sl-vikram', 'Vikram Patil', 'vikram.patil@shikshalokam.org', 'Intern', SL, 'user', at(45), 'deactivated'),

  u('u-m4c-ta', 'Sneha Kulkarni', 'tenantadmin@mantra4change.org', 'Head of technology', M4C, 'tenant_admin', hoursAgo(4)),
  u('u-m4c-dev', 'Rahul Menon', 'developer@mantra4change.org', 'Full-stack developer', M4C, 'user', hoursAgo(6)),
  u('u-m4c-divya', 'Divya Reddy', 'divya.reddy@mantra4change.org', 'Data analyst', M4C, 'user', hoursAgo(30)),
  u('u-m4c-sanjay', 'Sanjay Gupta', 'sanjay.gupta@mantra4change.org', 'ML engineer', M4C, 'user', hoursAgo(12)),
  u('u-m4c-aisha', 'Aisha Khan', 'aisha.khan@mantra4change.org', 'Product manager', M4C, 'user', hoursAgo(20)),
  u('u-m4c-manoj', 'Manoj Das', 'manoj.das@mantra4change.org', 'Developer', M4C, 'user', at(60), 'deactivated'),
]

/* ---------- projects ---------- */

const q = (vcpu: number, ramGb: number, gpus: number, storageGb: number): Quota => ({ vcpu, ramGb, gpus, storageGb })

export const seedProjects: Project[] = [
  { id: 'p-sl-edu', tenantId: SL, name: 'AI Education Assistant', description: 'Reading and maths help for children in Kannada and Hindi.', ownerId: 'u-sl-ta', memberIds: ['u-sl-dev', 'u-sl-meera'], status: 'active', limits: q(48, 192, 2, 1000), capabilityIds: ['cap-langgraph', 'cap-qdrant'], createdAt: at(200) },
  { id: 'p-sl-teacher', tenantId: SL, name: 'Teacher Support Chatbot', description: 'Answers teachers’ questions on lesson planning and classroom practice.', ownerId: 'u-sl-ta', memberIds: ['u-sl-dev', 'u-sl-kiran'], status: 'active', limits: q(40, 160, 2, 800), capabilityIds: ['cap-llamaindex'], createdAt: at(180) },
  { id: 'p-sl-speech', tenantId: SL, name: 'Multilingual Speech Recognition', description: 'Speech models for Indian languages, tested with classroom audio.', ownerId: 'u-sl-ta', memberIds: ['u-sl-fatima', 'u-sl-meera'], status: 'active', limits: q(40, 160, 2, 1200), capabilityIds: ['cap-deepeval'], createdAt: at(150) },

  { id: 'p-m4c-coach', tenantId: M4C, name: 'School Leader Coaching Assistant', description: 'Helps school leaders plan improvement goals and reflect on progress.', ownerId: 'u-m4c-ta', memberIds: ['u-m4c-dev', 'u-m4c-aisha'], status: 'active', limits: q(40, 160, 2, 800), capabilityIds: ['cap-crewai'], createdAt: at(150) },
  { id: 'p-m4c-docs', tenantId: M4C, name: 'Document Intelligence', description: 'Reads scanned school records and forms into structured data.', ownerId: 'u-m4c-ta', memberIds: ['u-m4c-sanjay', 'u-m4c-dev'], status: 'active', limits: q(32, 128, 1, 700), capabilityIds: ['cap-haystack', 'cap-pgvector'], createdAt: at(120) },
  { id: 'p-m4c-feedback', tenantId: M4C, name: 'Feedback Analysis', description: 'Finds themes in feedback from teachers and parents.', ownerId: 'u-m4c-ta', memberIds: ['u-m4c-divya', 'u-m4c-aisha'], status: 'active', limits: q(24, 96, 1, 500), capabilityIds: [], createdAt: at(100) },
]

/* ---------- catalog ---------- */

type BaseCatalogItem = Omit<CatalogItem, 'availability' | 'origin' | 'dependencies' | 'installInstructions' | 'resourceRequirements' | 'runtimes'>

const ALL_LANGS: CatalogItem['languages'] = ['Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'English']

const baseCatalog: BaseCatalogItem[] = [
  // LLMs
  { id: 'llm-gpt', name: 'GPT-5', category: 'llm', provider: 'OpenAI', hosting: 'hosted', version: '2025-08', versions: ['2025-08', '2025-05'], licence: 'Commercial API', gitUrl: 'https://github.com/openai/openai-python', docsUrl: 'https://platform.openai.com/docs', costPerUnit: 450, costUnit: 'per 1M tokens', languages: ALL_LANGS, status: 'active', description: 'General-purpose hosted model with strong reasoning and tool use.' },
  { id: 'llm-claude', name: 'Claude Sonnet 5.5', category: 'llm', provider: 'Anthropic', hosting: 'hosted', version: 'claude-sonnet-5-5', versions: ['claude-sonnet-5-5', 'claude-sonnet-5'], licence: 'Commercial API', gitUrl: 'https://github.com/anthropics/anthropic-sdk-python', docsUrl: 'https://docs.anthropic.com', costPerUnit: 500, costUnit: 'per 1M tokens', languages: ALL_LANGS, status: 'active', description: 'Hosted model suited to long documents, careful writing and agent workflows.' },
  { id: 'llm-gemini', name: 'Gemini 2.5 Pro', category: 'llm', provider: 'Google', hosting: 'hosted', version: '2.5-pro', versions: ['2.5-pro', '2.5-flash'], licence: 'Commercial API', gitUrl: 'https://github.com/googleapis/python-genai', docsUrl: 'https://ai.google.dev', costPerUnit: 300, costUnit: 'per 1M tokens', languages: ALL_LANGS, status: 'active', description: 'Hosted multimodal model with a long context window.' },
  { id: 'llm-llama', name: 'Llama 3.3 70B', category: 'llm', provider: 'Meta', hosting: 'open-source', version: '3.3-70b-instruct', versions: ['3.3-70b-instruct', '3.1-8b-instruct'], licence: 'Llama 3.3 Community Licence', gitUrl: 'https://github.com/meta-llama/llama-models', docsUrl: 'https://www.llama.com/docs', costPerUnit: 60, costUnit: 'per 1M tokens', languages: ['English', 'Hindi'], status: 'active', description: 'Open-weights model served on shared GPUs in the platform.' },
  { id: 'llm-mistral', name: 'Mistral Small 3.1', category: 'llm', provider: 'Mistral AI', hosting: 'open-source', version: '3.1', versions: ['3.1', '3.0'], licence: 'Apache 2.0', gitUrl: 'https://github.com/mistralai/mistral-inference', docsUrl: 'https://docs.mistral.ai', costPerUnit: 50, costUnit: 'per 1M tokens', languages: ['English', 'Hindi'], status: 'active', description: 'Compact open model, fast and inexpensive for classification and extraction.' },
  { id: 'llm-gemma', name: 'Gemma 3 27B', category: 'llm', provider: 'Google DeepMind', hosting: 'open-source', version: '3-27b-it', versions: ['3-27b-it', '3-12b-it'], licence: 'Gemma Terms of Use', gitUrl: 'https://github.com/google-deepmind/gemma', docsUrl: 'https://ai.google.dev/gemma', costPerUnit: 40, costUnit: 'per 1M tokens', languages: ['English', 'Hindi', 'Bengali', 'Marathi'], status: 'active', description: 'Open-weights model with good multilingual coverage for its size.' },
  { id: 'llm-sarvam', name: 'Sarvam-M', category: 'llm', provider: 'Sarvam AI', hosting: 'hosted', version: 'sarvam-m', versions: ['sarvam-m'], licence: 'Commercial API', gitUrl: null, docsUrl: 'https://docs.sarvam.ai', costPerUnit: 120, costUnit: 'per 1M tokens', languages: ALL_LANGS, status: 'active', description: 'Model tuned for Indian languages and code-mixed text.' },
  { id: 'llm-qwen', name: 'Qwen 2.5 7B Instruct', category: 'llm', provider: 'Alibaba Qwen', hosting: 'open-source', version: '2.5-7b-instruct', versions: ['2.5-7b-instruct'], licence: 'Apache 2.0', gitUrl: 'https://github.com/QwenLM/Qwen2.5', docsUrl: null, costPerUnit: 30, costUnit: 'per 1M tokens', languages: ['English', 'Hindi'], status: 'beta', description: 'Small open model for low-cost experiments and fine-tuning trials.' },
  { id: 'llm-gpt4o-mini', name: 'GPT-4o mini', category: 'llm', provider: 'OpenAI', hosting: 'hosted', version: '2024-07-18', versions: ['2024-07-18'], licence: 'Commercial API', gitUrl: 'https://github.com/openai/openai-python', docsUrl: 'https://platform.openai.com/docs', costPerUnit: 90, costUnit: 'per 1M tokens', languages: ALL_LANGS, status: 'deprecated', description: 'Older low-cost hosted model. Move to GPT-5 or an open model.' },

  // ASR
  { id: 'asr-indicconformer', name: 'IndicConformer', category: 'asr', provider: 'AI4Bharat', hosting: 'open-source', version: '600M-multilingual', versions: ['600M-multilingual'], licence: 'MIT', gitUrl: 'https://github.com/AI4Bharat', docsUrl: null, costPerUnit: 15, costUnit: 'per audio hour', languages: ['Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali'], status: 'active', description: 'Open speech recognition trained on Indian languages, self-hosted on platform GPUs.' },
  { id: 'asr-bhashini', name: 'Bhashini ASR', category: 'asr', provider: 'Bhashini (MeitY)', hosting: 'hosted', version: 'v2', versions: ['v2'], licence: 'Government of India terms', gitUrl: null, docsUrl: 'https://bhashini.gov.in', costPerUnit: 0, costUnit: 'free', languages: ALL_LANGS, status: 'active', description: 'Public speech service from the National Language Translation Mission.' },
  { id: 'asr-sarvam', name: 'Saarika', category: 'asr', provider: 'Sarvam AI', hosting: 'hosted', version: 'saarika-v2', versions: ['saarika-v2'], licence: 'Commercial API', gitUrl: null, docsUrl: 'https://docs.sarvam.ai', costPerUnit: 30, costUnit: 'per audio hour', languages: ALL_LANGS, status: 'active', description: 'Hosted speech recognition for Indian languages with code-mixed support.' },
  { id: 'asr-whisper', name: 'Whisper large-v3', category: 'asr', provider: 'OpenAI', hosting: 'open-source', version: 'large-v3', versions: ['large-v3', 'medium'], licence: 'MIT', gitUrl: 'https://github.com/openai/whisper', docsUrl: null, costPerUnit: 12, costUnit: 'per audio hour', languages: ALL_LANGS, status: 'active', description: 'Open multilingual speech model, self-hosted. Weaker on low-resource languages.' },
  { id: 'asr-google', name: 'Google Speech-to-Text', category: 'asr', provider: 'Google Cloud', hosting: 'hosted', version: 'chirp-2', versions: ['chirp-2'], licence: 'Commercial API', gitUrl: null, docsUrl: 'https://cloud.google.com/speech-to-text/docs', costPerUnit: 70, costUnit: 'per audio hour', languages: ALL_LANGS, status: 'active', description: 'Hosted speech recognition with broad language coverage.' },
  { id: 'asr-azure', name: 'Azure AI Speech', category: 'asr', provider: 'Microsoft', hosting: 'hosted', version: '2025-10', versions: ['2025-10'], licence: 'Commercial API', gitUrl: 'https://github.com/Azure-Samples/cognitive-services-speech-sdk', docsUrl: 'https://learn.microsoft.com/azure/ai-services/speech-service', costPerUnit: 60, costUnit: 'per audio hour', languages: ALL_LANGS, status: 'beta', description: 'Hosted speech recognition with custom vocabulary support.' },

  // Agent frameworks
  { id: 'cap-langgraph', name: 'LangGraph', category: 'agent-framework', provider: 'LangChain', hosting: 'open-source', version: '0.6', versions: ['0.6', '0.5'], licence: 'MIT', gitUrl: 'https://github.com/langchain-ai/langgraph', docsUrl: 'https://langchain-ai.github.io/langgraph', costPerUnit: 0, costUnit: 'free', languages: [], status: 'active', description: 'Build stateful, multi-step agents as graphs.' },
  { id: 'cap-crewai', name: 'CrewAI', category: 'agent-framework', provider: 'CrewAI', hosting: 'open-source', version: '0.140', versions: ['0.140', '0.120'], licence: 'MIT', gitUrl: 'https://github.com/crewAIInc/crewAI', docsUrl: 'https://docs.crewai.com', costPerUnit: 0, costUnit: 'free', languages: [], status: 'active', description: 'Coordinate role-based agents that work together on a task.' },
  { id: 'cap-llamaindex', name: 'LlamaIndex', category: 'agent-framework', provider: 'LlamaIndex', hosting: 'open-source', version: '0.12', versions: ['0.12', '0.11'], licence: 'MIT', gitUrl: 'https://github.com/run-llama/llama_index', docsUrl: 'https://docs.llamaindex.ai', costPerUnit: 0, costUnit: 'free', languages: [], status: 'active', description: 'Connect your documents to models for retrieval and question answering.' },

  // Vector DBs
  { id: 'cap-qdrant', name: 'Qdrant', category: 'vector-db', provider: 'Qdrant', hosting: 'open-source', version: '1.15', versions: ['1.15', '1.14'], licence: 'Apache 2.0', gitUrl: 'https://github.com/qdrant/qdrant', docsUrl: 'https://qdrant.tech/documentation', costPerUnit: 400, costUnit: 'per month', languages: [], status: 'active', description: 'Vector search engine with filtering, run as a managed instance per environment.' },
  { id: 'cap-weaviate', name: 'Weaviate', category: 'vector-db', provider: 'Weaviate', hosting: 'open-source', version: '1.32', versions: ['1.32'], licence: 'BSD 3-Clause', gitUrl: 'https://github.com/weaviate/weaviate', docsUrl: 'https://weaviate.io/developers/weaviate', costPerUnit: 450, costUnit: 'per month', languages: [], status: 'active', description: 'Vector database with built-in hybrid search.' },
  { id: 'cap-pgvector', name: 'pgvector', category: 'vector-db', provider: 'PostgreSQL community', hosting: 'open-source', version: '0.8', versions: ['0.8', '0.7'], licence: 'PostgreSQL Licence', gitUrl: 'https://github.com/pgvector/pgvector', docsUrl: null, costPerUnit: 200, costUnit: 'per month', languages: [], status: 'active', description: 'Vector search inside PostgreSQL, for teams that already use Postgres.' },
  { id: 'cap-chroma', name: 'Chroma', category: 'vector-db', provider: 'Chroma', hosting: 'open-source', version: '1.0', versions: ['1.0', '0.6'], licence: 'Apache 2.0', gitUrl: 'https://github.com/chroma-core/chroma', docsUrl: 'https://docs.trychroma.com', costPerUnit: 150, costUnit: 'per month', languages: [], status: 'active', description: 'Lightweight embedding store for prototypes.' },

  // Evaluation
  { id: 'cap-ragas', name: 'Ragas', category: 'evaluation', provider: 'Exploding Gradients', hosting: 'open-source', version: '0.3', versions: ['0.3', '0.2'], licence: 'Apache 2.0', gitUrl: 'https://github.com/explodinggradients/ragas', docsUrl: 'https://docs.ragas.io', costPerUnit: 0, costUnit: 'free', languages: [], status: 'active', description: 'Measure retrieval and answer quality for RAG pipelines.' },
  { id: 'cap-deepeval', name: 'DeepEval', category: 'evaluation', provider: 'Confident AI', hosting: 'open-source', version: '3.4', versions: ['3.4', '3.0'], licence: 'Apache 2.0', gitUrl: 'https://github.com/confident-ai/deepeval', docsUrl: 'https://deepeval.com/docs', costPerUnit: 0, costUnit: 'free', languages: [], status: 'active', description: 'Unit-test style evaluation for model outputs.' },
  { id: 'cap-promptfoo', name: 'Promptfoo', category: 'evaluation', provider: 'Promptfoo', hosting: 'open-source', version: '0.117', versions: ['0.117'], licence: 'MIT', gitUrl: 'https://github.com/promptfoo/promptfoo', docsUrl: 'https://www.promptfoo.dev/docs', costPerUnit: 0, costUnit: 'free', languages: [], status: 'active', description: 'Compare prompts and models side by side, and run red-team checks.' },

  // Low-code
  { id: 'cap-langflow', name: 'Langflow', category: 'low-code', provider: 'Langflow', hosting: 'open-source', version: '1.5', versions: ['1.5', '1.4'], licence: 'MIT', gitUrl: 'https://github.com/langflow-ai/langflow', docsUrl: 'https://docs.langflow.org', costPerUnit: 300, costUnit: 'per month', languages: [], status: 'active', description: 'Visual builder for model pipelines and agents.' },
  { id: 'cap-flowise', name: 'Flowise', category: 'low-code', provider: 'FlowiseAI', hosting: 'open-source', version: '3.0', versions: ['3.0', '2.2'], licence: 'Apache 2.0', gitUrl: 'https://github.com/FlowiseAI/Flowise', docsUrl: 'https://docs.flowiseai.com', costPerUnit: 300, costUnit: 'per month', languages: [], status: 'active', description: 'Drag-and-drop builder for chatbots and retrieval flows.' },
  { id: 'cap-dify', name: 'Dify', category: 'low-code', provider: 'LangGenius', hosting: 'open-source', version: '1.7', versions: ['1.7'], licence: 'Dify Open Source Licence', gitUrl: 'https://github.com/langgenius/dify', docsUrl: 'https://docs.dify.ai', costPerUnit: 350, costUnit: 'per month', languages: [], status: 'beta', description: 'App builder with prompt management, datasets and agent workflows.' },
]

function registryDefaults(item: BaseCatalogItem): Pick<CatalogItem, 'dependencies' | 'installInstructions' | 'resourceRequirements' | 'runtimes'> {
  if (item.category === 'llm' || item.category === 'asr') {
    return item.hosting === 'hosted'
      ? {
          dependencies: 'None. Calls go through the environment endpoint.',
          installInstructions: 'Nothing to install. Add it to an environment and call the endpoint with this model name.',
          resourceRequirements: 'No GPU needed in your environment; the provider serves it.',
          runtimes: ['Python', 'JavaScript', 'REST'],
        }
      : {
          dependencies: 'Served from the shared cluster with vLLM or NVIDIA Triton.',
          installInstructions: 'Nothing to install. The platform serves it; call it through your environment endpoint.',
          resourceRequirements: 'Served centrally. Fine-tuning needs an A10 or A100 environment.',
          runtimes: ['Python', 'JavaScript', 'REST'],
        }
  }
  const pkg = item.name.toLowerCase().replace(/\s+/g, '-')
  return {
    dependencies: item.category === 'vector-db' ? 'Runs as a managed service next to your environment.' : 'Python 3.10 or later',
    installInstructions: item.category === 'vector-db' ? 'Provisioned with the environment. Connection details appear on the environment page.' : `Pre-installed when attached. To use it locally: pip install ${pkg}`,
    resourceRequirements: item.category === 'vector-db' ? '2 vCPU and 8 GB RAM from your environment' : '1 vCPU and 2 GB RAM',
    runtimes: item.category === 'low-code' ? ['Web UI', 'REST'] : ['Python'],
  }
}

const RESTRICTED: Record<string, string[]> = {
  'asr-azure': [SL],
}

export const seedCatalog: CatalogItem[] = [
  ...baseCatalog.map((c) => ({
    ...c,
    availability: RESTRICTED[c.id] ?? ('all' as const),
    origin: 'registry' as const,
    ...registryDefaults(c),
  })),
  {
    id: 'cap-haystack',
    name: 'Haystack',
    category: 'agent-framework',
    provider: 'deepset',
    hosting: 'open-source',
    version: '2.15',
    versions: ['2.15'],
    licence: 'Apache 2.0',
    gitUrl: 'https://github.com/deepset-ai/haystack',
    docsUrl: 'https://docs.haystack.deepset.ai',
    costPerUnit: 0,
    costUnit: 'free',
    languages: [],
    status: 'beta',
    description: 'Framework for retrieval and document-processing pipelines.',
    availability: [M4C],
    origin: 'suggestion',
    dependencies: 'Python 3.10 or later',
    installInstructions: 'Pre-installed when attached. To use it locally: pip install haystack-ai',
    resourceRequirements: '1 vCPU and 2 GB RAM',
    runtimes: ['Python'],
  },
]

/* ---------- environments and requests ---------- */

const baseSpec: EnvSpec = {
  name: '',
  description: '',
  projectId: '',
  purpose: 'development',
  durationWeeks: 8,
  compute: 't4',
  gpuCount: 1,
  storageGb: 100,
  autoShutdownHours: 2,
  llms: [],
  asr: [],
  languages: [],
  asrHoursPerMonth: 0,
  capabilities: [],
  dataClassification: 'internal',
  containsPii: false,
  justification: '',
}

const spec = (s: Partial<EnvSpec>): EnvSpec => ({ ...baseSpec, ...s })

const TA: Record<string, string> = { [SL]: 'u-sl-ta', [M4C]: 'u-m4c-ta' }
const CODE: Record<string, string> = { [SL]: 'SLK-101', [M4C]: 'M4C-102' }
const FAILURE_REASON = 'Simulated: GPU capacity unavailable in pool'

interface EnvSeed {
  id: string
  tenantId: string
  ownerId: string
  status: EnvStatus
  createdDaysAgo: number
  creditsUsed: number
  spec: EnvSpec
  hold?: boolean
  hot?: boolean
  /** Events after the environment became active (stop, suspend, terminate). */
  later?: LifecycleEvent[]
}

const envSeeds: EnvSeed[] = [
  // ShikshaLokam
  {
    id: 'env-sl-tutor', tenantId: SL, ownerId: 'u-sl-dev', status: 'active', createdDaysAgo: 32, creditsUsed: 21400, hot: true,
    spec: spec({ name: 'Kannada reading tutor', description: 'Listens to children read aloud in Kannada and Hindi and gives gentle feedback.', projectId: 'p-sl-edu', compute: 'a10', storageGb: 200, llms: [{ id: 'llm-sarvam', tokenBudget: 4 }, { id: 'llm-llama', tokenBudget: 6 }], asr: ['asr-indicconformer'], languages: ['Kannada', 'Hindi'], asrHoursPerMonth: 40, capabilities: ['cap-langgraph', 'cap-qdrant'], dataClassification: 'children', containsPii: true, justification: 'Reading levels in our partner schools need daily practice that teachers can’t give one to one.' }),
  },
  {
    id: 'env-sl-lessonplan', tenantId: SL, ownerId: 'u-sl-kiran', status: 'stopped', createdDaysAgo: 40, creditsUsed: 9800,
    spec: spec({ name: 'Lesson-plan assistant', description: 'Drafts activity-based lesson plans from the state textbook.', projectId: 'p-sl-teacher', purpose: 'evaluation', compute: 't4', storageGb: 100, llms: [{ id: 'llm-claude', tokenBudget: 3 }, { id: 'llm-gpt', tokenBudget: 2 }], capabilities: ['cap-llamaindex', 'cap-chroma', 'cap-promptfoo'], justification: 'Compare two models before the teacher training cycle.' }),
    later: [ev('stopped', at(3, 18, 0), 'u-sl-kiran', 'user', 'Evaluation finished for this cycle.')],
  },
  {
    id: 'env-sl-asr-ft', tenantId: SL, ownerId: 'u-sl-fatima', status: 'provisioning', createdDaysAgo: 1, creditsUsed: 0, hold: true,
    spec: spec({ name: 'IndicConformer fine-tuning', description: 'Fine-tune speech recognition on classroom recordings in three languages.', projectId: 'p-sl-speech', purpose: 'evaluation', compute: 'a100', storageGb: 500, asr: ['asr-indicconformer', 'asr-whisper'], languages: ['Kannada', 'Tamil', 'Telugu'], asrHoursPerMonth: 120, capabilities: ['cap-deepeval'], dataClassification: 'children', containsPii: true, justification: 'Classroom audio is noisy; off-the-shelf models miss too many words.' }),
  },
  {
    id: 'env-sl-whatsapp', tenantId: SL, ownerId: 'u-sl-dev', status: 'suspended', createdDaysAgo: 25, creditsUsed: 12600,
    spec: spec({ name: 'Teacher WhatsApp helpline', description: 'Answers teachers’ questions over WhatsApp using the programme handbook.', projectId: 'p-sl-teacher', purpose: 'pilot', compute: 'a10', storageGb: 150, llms: [{ id: 'llm-gpt', tokenBudget: 5 }], capabilities: ['cap-langgraph', 'cap-pgvector'], dataClassification: 'personal', containsPii: true, justification: 'Pilot with 300 teachers in Dharwad district.' }),
    later: [ev('suspended', at(2, 16, 40), SUPER_ADMIN_ID, 'super_admin', 'Paused: teachers’ phone numbers were sent to a hosted model without a consent record. Add the consent step and we’ll resume it.')],
  },
  {
    id: 'env-sl-asr-eval', tenantId: SL, ownerId: 'u-sl-meera', status: 'provisioning_failed', createdDaysAgo: 2, creditsUsed: 0,
    spec: spec({ name: 'Speech benchmark batch', description: 'Batch-score five hours of test audio across two providers.', projectId: 'p-sl-speech', purpose: 'evaluation', compute: 'a100', gpuCount: 2, storageGb: 300, asr: ['asr-whisper', 'asr-google'], languages: ['Hindi', 'Kannada'], asrHoursPerMonth: 60, justification: 'Need a baseline before the fine-tuning results come in.' }),
  },

  // Mantra4Change
  {
    id: 'env-m4c-coach', tenantId: M4C, ownerId: 'u-m4c-dev', status: 'active', createdDaysAgo: 28, creditsUsed: 17300, hot: true,
    spec: spec({ name: 'Leader coaching assistant', description: 'Helps school leaders set goals and reflect after classroom walks, in Telugu and English.', projectId: 'p-m4c-coach', compute: 'a10', storageGb: 150, llms: [{ id: 'llm-claude', tokenBudget: 4 }, { id: 'llm-sarvam', tokenBudget: 2 }], asr: ['asr-bhashini'], languages: ['Telugu', 'English'], asrHoursPerMonth: 20, capabilities: ['cap-crewai', 'cap-weaviate'], justification: 'Coaches can meet each leader only once a month.' }),
  },
  {
    id: 'env-m4c-docparse', tenantId: M4C, ownerId: 'u-m4c-sanjay', status: 'stopped', createdDaysAgo: 35, creditsUsed: 4200,
    spec: spec({ name: 'Document parser evaluation', description: 'Extracts fields from school development plans.', projectId: 'p-m4c-docs', purpose: 'evaluation', compute: 'cpu', storageGb: 100, llms: [{ id: 'llm-mistral', tokenBudget: 3 }], capabilities: ['cap-llamaindex', 'cap-pgvector', 'cap-ragas'], dataClassification: 'internal', justification: 'Check extraction accuracy before scaling up.' }),
    later: [ev('stopped', at(6, 19, 10), 'u-m4c-sanjay', 'user')],
  },
  {
    id: 'env-m4c-feedback', tenantId: M4C, ownerId: 'u-m4c-divya', status: 'provisioning', createdDaysAgo: 0, creditsUsed: 0, hold: true,
    spec: spec({ name: 'Feedback theme classifier', description: 'Groups open-ended feedback from teachers into themes.', projectId: 'p-m4c-feedback', compute: 't4', storageGb: 100, llms: [{ id: 'llm-gemma', tokenBudget: 3 }], capabilities: ['cap-promptfoo'], justification: '12,000 survey responses arrive next month.' }),
  },
  {
    id: 'env-m4c-visits', tenantId: M4C, ownerId: 'u-m4c-aisha', status: 'suspended', createdDaysAgo: 20, creditsUsed: 6100,
    spec: spec({ name: 'School visit summariser', description: 'Turns field notes from school visits into short summaries.', projectId: 'p-m4c-coach', compute: 't4', storageGb: 80, llms: [{ id: 'llm-gemini', tokenBudget: 2 }], capabilities: ['cap-langgraph'], justification: 'Field coordinators spend an hour a day writing summaries.' }),
    later: [ev('suspended', at(1, 11, 15), SUPER_ADMIN_ID, 'super_admin', 'Paused while we look into unusual token use over the weekend. We’ll resume it after a quick check with your team.')],
  },
  {
    id: 'env-m4c-ocr', tenantId: M4C, ownerId: 'u-m4c-ta', status: 'provisioning_failed', createdDaysAgo: 1, creditsUsed: 0,
    spec: spec({ name: 'Scanned forms OCR', description: 'Reads handwritten enrolment forms from 40 schools.', projectId: 'p-m4c-docs', compute: 'a10', storageGb: 200, llms: [{ id: 'llm-gpt', tokenBudget: 3 }], dataClassification: 'personal', containsPii: true, justification: 'Enrolment data entry takes field staff two weeks each term.' }),
  },
  {
    id: 'env-m4c-pilot-v0', tenantId: M4C, ownerId: 'u-m4c-dev', status: 'terminated', createdDaysAgo: 75, creditsUsed: 3900,
    spec: spec({ name: 'Coaching chatbot v0', description: 'First prototype of the coaching assistant.', projectId: 'p-m4c-coach', compute: 'cpu', storageGb: 50, llms: [{ id: 'llm-mistral', tokenBudget: 1 }], justification: 'Early prototype.' }),
    later: [ev('terminated', at(30, 12, 0), 'u-m4c-ta', 'tenant_admin', 'Replaced by the leader coaching assistant.')],
  },
]

function approvalHistory(e: EnvSeed) {
  const d = e.createdDaysAgo
  const owner = seedUsers.find((x) => x.id === e.ownerId)!
  const submitted = at(d + 1, 10, 5)
  const req: LifecycleEvent[] = [ev('submitted', submitted, e.ownerId, owner.role)]
  if (owner.role === 'tenant_admin') {
    req.push(ev('escalated', plusMinutes(submitted, 1), 'system', 'system', 'Raised by a Tenant Admin, so it went straight to the Super Admin.'))
  } else {
    req.push(ev('under_review', at(d + 1, 11, 0), TA[e.tenantId]!, 'tenant_admin'))
    req.push(ev('escalated', at(d + 1, 11, 20), TA[e.tenantId]!, 'tenant_admin', 'Within quota. Forwarding for approval.'))
  }
  const approvedAt = at(d, 10, 30)
  req.push(ev('approved', approvedAt, SUPER_ADMIN_ID, 'super_admin'))

  const env: LifecycleEvent[] = [ev('provisioning', approvedAt, 'system', 'system', e.hold ? 'Waiting for a GPU in the shared pool.' : undefined)]
  if (e.status === 'provisioning_failed') {
    env.push(ev('provisioning_failed', plusMinutes(approvedAt, 6), 'system', 'system', FAILURE_REASON))
  } else if (e.status !== 'provisioning') {
    env.push(ev('active', plusMinutes(approvedAt, 5), 'system', 'system'))
    env.push(...(e.later ?? []))
  }
  return { req, env, submitted, approvedAt }
}

const built = envSeeds.map((e) => {
  const owner = seedUsers.find((x) => x.id === e.ownerId)!
  const h = approvalHistory(e)
  const requestId = `req-${e.id.slice(4)}`
  const environment: Environment = {
    id: e.id,
    tenantId: e.tenantId,
    projectId: e.spec.projectId,
    ownerId: e.ownerId,
    requestId,
    status: e.status,
    spec: e.spec,
    endpoint: endpointFor(CODE[e.tenantId]!, e.id),
    apiKey: apiKey(e.id),
    creditsUsed: e.creditsUsed,
    createdAt: h.approvedAt,
    expiresAt: e.status === 'terminated' ? null : daysAhead(e.spec.durationWeeks * 7 - e.createdDaysAgo),
    history: h.env,
    failureReason: e.status === 'provisioning_failed' ? FAILURE_REASON : null,
    provisionDueAt: null,
    hold: !!e.hold,
    loadProfile: e.hot ? 'hot' : 'normal',
  }
  const request: EnvRequest = {
    id: requestId,
    kind: 'new',
    tenantId: e.tenantId,
    requesterId: e.ownerId,
    raisedByRole: owner.role,
    envId: e.id,
    spec: e.spec,
    previousSpec: null,
    status: 'approved',
    createdAt: h.submitted,
    updatedAt: h.approvedAt,
    history: h.req,
    comments: [],
    adminChanges: [],
    simulateFailure: e.status === 'provisioning_failed',
  }
  return { environment, request }
})

export const seedEnvironments: Environment[] = built.map((b) => b.environment)

interface OpenSeed {
  id: string
  tenantId: string
  requesterId: string
  spec: EnvSpec
  history: LifecycleEvent[]
  comments?: EnvRequest['comments']
}

const open = (o: OpenSeed): EnvRequest => {
  const requester = seedUsers.find((x) => x.id === o.requesterId)!
  return {
    id: o.id,
    kind: 'new',
    tenantId: o.tenantId,
    requesterId: o.requesterId,
    raisedByRole: requester.role,
    envId: null,
    spec: o.spec,
    previousSpec: null,
    status: o.history[o.history.length - 1]!.status as EnvRequest['status'],
    createdAt: o.history[0]!.at,
    updatedAt: o.history[o.history.length - 1]!.at,
    history: o.history,
    comments: o.comments ?? [],
    adminChanges: [],
    simulateFailure: false,
  }
}

const openRequests: EnvRequest[] = [
  // ShikshaLokam
  open({
    id: 'req-sl-phonics', tenantId: SL, requesterId: 'u-sl-dev',
    spec: spec({ name: 'Kannada phonics practice', description: 'Short phonics games with spoken feedback.', projectId: 'p-sl-edu', compute: 't4', llms: [{ id: 'llm-sarvam', tokenBudget: 2 }] }),
    history: [ev('draft', hoursAgo(20), 'u-sl-dev', 'user')],
  }),
  open({
    id: 'req-sl-feedback', tenantId: SL, requesterId: 'u-sl-meera',
    spec: spec({ name: 'Teacher feedback summariser', description: 'Summarises observation notes into feedback for teachers.', projectId: 'p-sl-teacher', compute: 't4', llms: [{ id: 'llm-gemini', tokenBudget: 2 }], capabilities: ['cap-promptfoo'], justification: 'Mentors write 40 feedback notes a week by hand.' }),
    history: [ev('submitted', hoursAgo(1), 'u-sl-meera', 'user')],
  }),
  open({
    id: 'req-sl-labelling', tenantId: SL, requesterId: 'u-sl-kiran',
    spec: spec({ name: 'Speech labelling workbench', description: 'A tool for volunteers to correct speech transcripts.', projectId: 'p-sl-speech', compute: 'a100', storageGb: 200, asr: ['asr-indicconformer'], languages: ['Kannada'], asrHoursPerMonth: 30, justification: 'Volunteers need a fast way to fix transcripts for training data.' }),
    history: [
      ev('submitted', at(3, 9, 30), 'u-sl-kiran', 'user'),
      ev('under_review', at(3, 12, 0), 'u-sl-ta', 'tenant_admin'),
      ev('changes_requested', at(3, 12, 10), 'u-sl-ta', 'tenant_admin', 'An A100 is more than labelling needs. Please switch to a T4 and resubmit.'),
    ],
  }),
  open({
    id: 'req-sl-benchmark', tenantId: SL, requesterId: 'u-sl-fatima',
    spec: spec({ name: 'Multilingual ASR benchmark', description: 'Benchmark four speech models on 20 hours of classroom audio.', projectId: 'p-sl-speech', purpose: 'evaluation', compute: 'a100', gpuCount: 3, storageGb: 400, asr: ['asr-indicconformer', 'asr-sarvam', 'asr-whisper'], languages: ['Kannada', 'Hindi', 'Tamil'], asrHoursPerMonth: 80, capabilities: ['cap-deepeval'], dataClassification: 'children', containsPii: true, justification: 'The state wants benchmark numbers before choosing a provider.' }),
    history: [
      ev('submitted', at(2, 10, 0), 'u-sl-fatima', 'user'),
      ev('under_review', at(2, 14, 0), 'u-sl-ta', 'tenant_admin'),
      ev('escalated', at(2, 14, 20), 'u-sl-ta', 'tenant_admin', 'This needs 3 GPUs and we have 2 left. Forwarding so you can decide on the extra GPU.'),
    ],
  }),
  open({
    id: 'req-sl-attendance', tenantId: SL, requesterId: 'u-sl-kiran',
    spec: spec({ name: 'Student face attendance', description: 'Marks attendance from classroom photos.', projectId: 'p-sl-edu', compute: 't4', dataClassification: 'children', containsPii: true, justification: 'Saves teachers ten minutes each morning.' }),
    history: [
      ev('submitted', at(9, 9, 0), 'u-sl-kiran', 'user'),
      ev('under_review', at(9, 11, 0), 'u-sl-ta', 'tenant_admin'),
      ev('rejected', at(9, 11, 30), 'u-sl-ta', 'tenant_admin', 'We don’t process photos of children’s faces. Please keep using the roll-call app.'),
    ],
  }),
  open({
    id: 'req-sl-faq', tenantId: SL, requesterId: 'u-sl-dev',
    spec: spec({ name: 'Old FAQ bot migration', description: 'Move the old FAQ bot onto the platform.', projectId: 'p-sl-teacher', compute: 'cpu', llms: [{ id: 'llm-mistral', tokenBudget: 1 }] }),
    history: [ev('submitted', at(14, 15, 0), 'u-sl-dev', 'user'), ev('cancelled', at(13, 10, 0), 'u-sl-dev', 'user', 'No longer needed; the helpline replaces it.')],
  }),

  // Mantra4Change
  open({
    id: 'req-m4c-voice', tenantId: M4C, requesterId: 'u-m4c-dev',
    spec: spec({ name: 'Principal voice notes', description: 'Lets principals record reflections by voice.', projectId: 'p-m4c-coach', compute: 't4', asr: ['asr-bhashini'], languages: ['Telugu'], asrHoursPerMonth: 15 }),
    history: [ev('draft', hoursAgo(30), 'u-m4c-dev', 'user')],
  }),
  open({
    id: 'req-m4c-observation', tenantId: M4C, requesterId: 'u-m4c-divya',
    spec: spec({ name: 'Classroom observation analytics', description: 'Finds patterns across 2,000 classroom observations.', projectId: 'p-m4c-feedback', purpose: 'evaluation', compute: 'a10', storageGb: 150, llms: [{ id: 'llm-claude', tokenBudget: 3 }], capabilities: ['cap-ragas'], justification: 'District teams want to see trends before the next review.' }),
    history: [ev('submitted', at(2, 16, 0), 'u-m4c-divya', 'user'), ev('under_review', at(1, 10, 0), 'u-m4c-ta', 'tenant_admin')],
  }),
  open({
    id: 'req-m4c-sip', tenantId: M4C, requesterId: 'u-m4c-aisha',
    spec: spec({ name: 'School improvement plan generator', description: 'Drafts improvement plans from school data for leaders to edit.', projectId: 'p-m4c-coach', compute: 'a10', autoShutdownHours: 1, llms: [{ id: 'llm-claude', tokenBudget: 3 }], justification: 'Pilot in 25 schools in Nalgonda district.' }),
    history: [
      ev('submitted', at(5, 10, 0), 'u-m4c-aisha', 'user'),
      ev('under_review', at(5, 15, 0), 'u-m4c-ta', 'tenant_admin'),
      ev('changes_requested', at(5, 15, 10), 'u-m4c-ta', 'tenant_admin', 'Please add which schools are in the pilot and switch on auto-shutdown.'),
      ev('resubmitted', at(4, 9, 40), 'u-m4c-aisha', 'user'),
    ],
  }),
  open({
    id: 'req-m4c-docscale', tenantId: M4C, requesterId: 'u-m4c-sanjay',
    spec: spec({ name: 'Document intelligence at scale', description: 'Process scanned records from all partner schools.', projectId: 'p-m4c-docs', compute: 'a100', storageGb: 300, llms: [{ id: 'llm-gpt', tokenBudget: 4 }], capabilities: ['cap-haystack', 'cap-pgvector'], dataClassification: 'personal', containsPii: true, justification: 'The evaluation hit 94% field accuracy; we’re ready to scale.' }),
    history: [
      ev('submitted', at(1, 9, 0), 'u-m4c-sanjay', 'user'),
      ev('under_review', at(1, 12, 0), 'u-m4c-ta', 'tenant_admin'),
      ev('escalated', at(1, 12, 15), 'u-m4c-ta', 'tenant_admin', 'Within quota. Forwarding for approval.'),
    ],
  }),
  open({
    id: 'req-m4c-sentiment', tenantId: M4C, requesterId: 'u-m4c-dev',
    spec: spec({ name: 'Feedback sentiment dashboard', description: 'Shows sentiment trends in parent feedback.', projectId: 'p-m4c-feedback', compute: 'cpu', llms: [{ id: 'llm-mistral', tokenBudget: 2 }], justification: 'Parents’ feedback is read by hand today.' }),
    history: [ev('submitted', hoursAgo(3), 'u-m4c-dev', 'user')],
  }),
  open({
    id: 'req-m4c-broadcast', tenantId: M4C, requesterId: 'u-m4c-aisha',
    spec: spec({ name: 'Bulk WhatsApp broadcast', description: 'Send generated messages to all parents.', projectId: 'p-m4c-feedback', compute: 't4', llms: [{ id: 'llm-gpt', tokenBudget: 6 }], dataClassification: 'personal', containsPii: true, justification: 'Reach parents before the school year starts.' }),
    history: [
      ev('submitted', at(12, 10, 0), 'u-m4c-aisha', 'user'),
      ev('under_review', at(12, 11, 0), 'u-m4c-ta', 'tenant_admin'),
      ev('escalated', at(12, 11, 10), 'u-m4c-ta', 'tenant_admin'),
      ev('rejected', at(11, 16, 0), SUPER_ADMIN_ID, 'super_admin', 'Bulk messaging to parents is outside the platform’s acceptable use. Please use your SMS provider for broadcasts.'),
    ],
  }),
]

export const seedRequests: EnvRequest[] = [...openRequests, ...built.map((b) => b.request)]

/* ---------- providers ---------- */

export const seedProviders: Provider[] = [
  { id: 'p-openai', name: 'OpenAI', kind: 'llm', maskedKey: 'sk-••••••••••3f9a', enabled: true, health: 'healthy', latencyMs: 820, region: 'US / EU', serves: ['llm-gpt', 'llm-gpt4o-mini'] },
  { id: 'p-anthropic', name: 'Anthropic', kind: 'llm', maskedKey: 'sk-ant-••••••••7c21', enabled: true, health: 'healthy', latencyMs: 760, region: 'US', serves: ['llm-claude'] },
  { id: 'p-google', name: 'Google Vertex AI', kind: 'llm', maskedKey: 'AIza••••••••••k2Pq', enabled: true, health: 'degraded', latencyMs: 1340, region: 'asia-south1 (Mumbai)', serves: ['llm-gemini'] },
  { id: 'p-sarvam', name: 'Sarvam AI', kind: 'llm', maskedKey: 'sv-••••••••••91de', enabled: true, health: 'healthy', latencyMs: 540, region: 'India', serves: ['llm-sarvam', 'asr-sarvam'] },
  { id: 'p-vllm', name: 'Self-hosted vLLM cluster', kind: 'llm', maskedKey: 'internal-••••••a0b4', enabled: true, health: 'healthy', latencyMs: 410, region: 'Bengaluru DC', serves: ['llm-llama', 'llm-mistral', 'llm-gemma', 'llm-qwen'] },
  { id: 'p-ai4bharat', name: 'Self-hosted speech cluster', kind: 'asr', maskedKey: 'internal-••••••5e77', enabled: true, health: 'healthy', latencyMs: 380, region: 'Bengaluru DC', serves: ['asr-indicconformer', 'asr-whisper'] },
  { id: 'p-bhashini', name: 'Bhashini', kind: 'asr', maskedKey: 'bh-••••••••••4410', enabled: true, health: 'healthy', latencyMs: 690, region: 'India', serves: ['asr-bhashini'] },
  { id: 'p-gstt', name: 'Google Speech-to-Text', kind: 'asr', maskedKey: 'AIza••••••••••Lm8s', enabled: true, health: 'healthy', latencyMs: 610, region: 'asia-south1 (Mumbai)', serves: ['asr-google'] },
  { id: 'p-azure', name: 'Azure AI Speech', kind: 'asr', maskedKey: 'az-••••••••••c0f3', enabled: false, health: 'down', latencyMs: 0, region: 'Central India', serves: ['asr-azure'] },
]

/* ---------- usage (30 days) ---------- */

const usageProfile: Record<string, { credits: number; gpu: number; calls: number }> = {
  [SL]: { credits: 2100, gpu: 9, calls: 12500 },
  [M4C]: { credits: 1350, gpu: 5, calls: 8100 },
}

export const seedUsage: UsagePoint[] = (() => {
  const out: UsagePoint[] = []
  for (const tenantId of [SL, M4C]) {
    const rand = seededRandom(hashString(tenantId))
    const p = usageProfile[tenantId]!
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY)
      const weekend = d.getDay() === 0 || d.getDay() === 6
      const growth = 0.75 + ((29 - i) / 29) * 0.4
      const f = (weekend ? 0.45 : 1) * growth * (0.85 + rand() * 0.3)
      out.push({
        date: d.toISOString().slice(0, 10),
        tenantId,
        credits: Math.round(p.credits * f),
        gpuHours: Math.round(p.gpu * f * 10) / 10,
        apiCalls: Math.round(p.calls * f),
      })
    }
  }
  return out
})()

/* ---------- suggestions ---------- */

export const seedSuggestions: Suggestion[] = [
  {
    id: 's-sl-langfuse',
    tenantId: SL,
    suggestedById: 'u-sl-meera',
    githubUrl: 'https://github.com/langfuse/langfuse',
    name: 'Langfuse',
    category: 'evaluation',
    description: 'Open-source tracing and evaluation for LLM applications.',
    useCase: 'We need to trace tutor conversations and score answer quality school by school.',
    licence: 'MIT',
    docsUrl: 'https://langfuse.com/docs',
    status: 'submitted',
    forwarded: false,
    history: [{ status: 'submitted', at: hoursAgo(18), actorId: 'u-sl-meera', actorRole: 'user' }],
    catalogItemId: null,
    createdAt: hoursAgo(18),
  },
  {
    id: 's-m4c-haystack',
    tenantId: M4C,
    suggestedById: 'u-m4c-sanjay',
    githubUrl: 'https://github.com/deepset-ai/haystack',
    name: 'Haystack',
    category: 'agent-framework',
    description: 'Framework for retrieval and document-processing pipelines.',
    useCase: 'Our document intelligence project needs pipelines for scanned school records.',
    licence: 'Apache 2.0',
    docsUrl: 'https://docs.haystack.deepset.ai',
    status: 'approved_tenant',
    forwarded: false,
    history: [
      { status: 'submitted', at: at(8, 10, 0), actorId: 'u-m4c-sanjay', actorRole: 'user' },
      { status: 'under_review', at: at(8, 14, 0), actorId: 'u-m4c-ta', actorRole: 'tenant_admin' },
      { status: 'approved_tenant', at: at(7, 11, 0), actorId: 'u-m4c-ta', actorRole: 'tenant_admin', comment: 'Approved for Mantra4Change. Try it in Document Intelligence first.' },
    ],
    catalogItemId: 'cap-haystack',
    createdAt: at(8, 10, 0),
  },
]

/* ---------- quota requests ---------- */

export const seedQuotaRequests: QuotaRequest[] = [
  {
    id: 'qr-m4c-gpu',
    tenantId: M4C,
    requestedById: 'u-m4c-ta',
    current: { vcpu: 96, ramGb: 384, gpus: 4, storageGb: 2000 },
    requested: { vcpu: 128, ramGb: 512, gpus: 6, storageGb: 2500 },
    reason: 'Two district pilots start in January and both need GPU environments.',
    status: 'pending',
    createdAt: hoursAgo(28),
    decidedAt: null,
    decidedById: null,
    comment: null,
  },
]

/* ---------- test runs ---------- */

export const seedTestRuns: TestRun[] = [
  { id: 'tr-1', envId: 'env-sl-tutor', tenantId: SL, actorId: 'u-sl-dev', kind: 'functional', at: at(4, 15, 0), summary: '4 of 5 functional tests passed with Sarvam-M', passed: false },
  { id: 'tr-2', envId: 'env-sl-tutor', tenantId: SL, actorId: 'u-sl-dev', kind: 'load', at: at(3, 16, 30), summary: 'Load test passed at 200 virtual users (p95 640 ms)', passed: true },
  { id: 'tr-3', envId: 'env-m4c-coach', tenantId: M4C, actorId: 'u-m4c-dev', kind: 'functional', at: at(5, 12, 0), summary: '5 of 5 functional tests passed with Claude Sonnet 5.5', passed: true },
  { id: 'tr-4', envId: 'env-m4c-coach', tenantId: M4C, actorId: 'u-m4c-dev', kind: 'load', at: at(2, 17, 0), summary: 'Load test failed at 400 virtual users (p95 2,810 ms)', passed: false },
]

/* ---------- platform capacity ---------- */

export const seedCapacity: Quota = { vcpu: 512, ramGb: 2048, gpus: 16, storageGb: 10000 }

/* ---------- audit log (derived from seeded histories, plus platform events) ---------- */

const STATUS_VERB: Partial<Record<LifecycleStatus, string>> = {
  submitted: 'submitted',
  under_review: 'started reviewing',
  escalated: 'forwarded to the Super Admin',
  approved: 'approved',
  rejected: 'rejected',
  changes_requested: 'requested changes to',
  resubmitted: 'resubmitted',
  cancelled: 'cancelled',
  stopped: 'stopped',
  suspended: 'suspended',
  terminated: 'terminated',
  active: 'marked active',
  provisioning_failed: 'marked provisioning failed for',
}

const userName = (id: string) => (id === 'system' ? 'System' : (seedUsers.find((x) => x.id === id)?.name ?? 'Someone'))

export const seedAudit: AuditEntry[] = (() => {
  const out: AuditEntry[] = []
  let n = 0
  const push = (e: Omit<AuditEntry, 'id'>) => out.push({ ...e, id: `a-${++n}` })
  for (const r of seedRequests) {
    for (const h of r.history) {
      if (h.status === 'draft') continue
      push({
        at: h.at,
        actorId: h.actorId,
        actorRole: h.actorRole,
        tenantId: r.tenantId,
        action: `request.${h.status}`,
        entityType: 'request',
        entityId: r.id,
        summary:
          h.status === 'escalated'
            ? h.actorId === 'system'
              ? `“${r.spec.name}” went straight to the Super Admin`
              : `${userName(h.actorId)} forwarded “${r.spec.name}” to the Super Admin`
            : `${userName(h.actorId)} ${STATUS_VERB[h.status] ?? h.status} “${r.spec.name}”`,
        comment: h.comment,
      })
    }
  }
  for (const e of seedEnvironments) {
    for (const h of e.history) {
      if (h.status === 'provisioning' || h.actorId === 'system') continue
      push({
        at: h.at,
        actorId: h.actorId,
        actorRole: h.actorRole,
        tenantId: e.tenantId,
        action: `environment.${h.status}`,
        entityType: 'environment',
        entityId: e.id,
        summary: `${userName(h.actorId)} ${STATUS_VERB[h.status] ?? h.status} “${e.spec.name}”`,
        comment: h.comment,
      })
    }
  }
  push({ at: at(7, 11, 0), actorId: 'u-m4c-ta', actorRole: 'tenant_admin', tenantId: M4C, action: 'suggestion.approved_tenant', entityType: 'suggestion', entityId: 's-m4c-haystack', summary: 'Sneha Kulkarni approved the suggestion “Haystack” for Mantra4Change' })
  push({ at: hoursAgo(28), actorId: 'u-m4c-ta', actorRole: 'tenant_admin', tenantId: M4C, action: 'quota.requested', entityType: 'quota', entityId: 'qr-m4c-gpu', summary: 'Sneha Kulkarni asked for a quota increase to 6 GPUs' })
  push({ at: at(1, 17, 5), actorId: SUPER_ADMIN_ID, actorRole: 'super_admin', tenantId: null, action: 'provider.disabled', entityType: 'provider', entityId: 'p-azure', summary: 'Platform Administrator disabled Azure AI Speech after repeated timeouts' })
  push({ at: at(6, 12, 10), actorId: SUPER_ADMIN_ID, actorRole: 'super_admin', tenantId: null, action: 'catalog.deprecated', entityType: 'catalog', entityId: 'llm-gpt4o-mini', summary: 'Platform Administrator marked GPT-4o mini as deprecated' })
  push({ at: at(4, 15, 0), actorId: 'u-sl-dev', actorRole: 'user', tenantId: SL, action: 'test.functional', entityType: 'test', entityId: 'tr-1', summary: 'Arjun Rao ran 5 functional tests on “Kannada reading tutor”: 4 passed' })
  push({ at: at(2, 17, 0), actorId: 'u-m4c-dev', actorRole: 'user', tenantId: M4C, action: 'test.load', entityType: 'test', entityId: 'tr-4', summary: 'Rahul Menon ran a load test on “Leader coaching assistant”: failed at 400 virtual users' })
  return out.sort((a, b) => b.at.localeCompare(a.at))
})()

/* ---------- notifications ---------- */

export const seedNotifications: Notification[] = [
  { id: 'n-1', userId: 'u-sl-dev', at: at(2, 16, 40), text: '“Teacher WhatsApp helpline” was suspended by the Super Admin. Open it to see why.', link: '/app/environments/env-sl-whatsapp', read: false },
  { id: 'n-2', userId: 'u-sl-dev', at: at(13, 10, 0), text: 'You cancelled “Old FAQ bot migration”.', link: '/app/requests/req-sl-faq', read: true },
  { id: 'n-3', userId: 'u-sl-ta', at: hoursAgo(1), text: 'New request from Meera Iyer: “Teacher feedback summariser”.', link: '/tenant-admin/requests/req-sl-feedback', read: false },
  { id: 'n-4', userId: 'u-sl-ta', at: at(2, 16, 40), text: 'The Super Admin suspended “Teacher WhatsApp helpline”.', link: '/tenant-admin/infrastructure/env-sl-whatsapp', read: false },
  { id: 'n-5', userId: 'u-sl-kiran', at: at(3, 12, 10), text: 'Ramya Krishnan asked for changes to “Speech labelling workbench”.', link: '/app/requests/req-sl-labelling', read: false },
  { id: 'n-6', userId: SUPER_ADMIN_ID, at: at(2, 14, 20), text: 'Escalated from ShikshaLokam: “Multilingual ASR benchmark” is over quota.', link: '/super-admin/requests/req-sl-benchmark', read: false },
  { id: 'n-7', userId: SUPER_ADMIN_ID, at: at(1, 12, 15), text: 'Escalated from Mantra4Change: “Document intelligence at scale”.', link: '/super-admin/requests/req-m4c-docscale', read: false },
  { id: 'n-8', userId: SUPER_ADMIN_ID, at: hoursAgo(28), text: 'Mantra4Change asked for a quota increase.', link: '/super-admin/requests?tab=quota', read: true },
  { id: 'n-9', userId: 'u-m4c-dev', at: at(30, 12, 0), text: 'Sneha Kulkarni terminated “Coaching chatbot v0”.', link: '/app/environments/env-m4c-pilot-v0', read: true },
  { id: 'n-10', userId: 'u-m4c-ta', at: at(4, 9, 40), text: 'Aisha Khan resubmitted “School improvement plan generator”.', link: '/tenant-admin/requests/req-m4c-sip', read: false },
  { id: 'n-11', userId: 'u-m4c-ta', at: hoursAgo(3), text: 'New request from Rahul Menon: “Feedback sentiment dashboard”.', link: '/tenant-admin/requests/req-m4c-sentiment', read: false },
  { id: 'n-12', userId: 'u-m4c-aisha', at: at(1, 11, 15), text: '“School visit summariser” was suspended by the Super Admin.', link: '/app/environments/env-m4c-visits', read: false },
]

/* ---------- testing samples ---------- */

export interface PlaygroundPrompt {
  id: string
  label: string
  prompt: string
  /** Distinct answers; models are assigned one each so a comparison never shows duplicates. */
  responses: string[]
}

export const PLAYGROUND_PROMPTS: PlaygroundPrompt[] = [
  {
    id: 'pp-crop',
    label: 'Crop advice (code-mixed)',
    prompt:
      'A farmer in Dharwad asks: "Nanna maize bele alli huLu ide, enu maadbeku?" Reply in simple Kannada-English mix, in under 80 words.',
    responses: [
      'Namaskara! Idu fall armyworm irbahudu. Ele mele chikka holes mattu suli olage saw-dust tara kasa nodi. Modalu neem seed extract (5%) spray maadi. Holes jaasti iddare, hattira Raitha Samparka Kendra officer hatra keLi — sariyaada pesticide mattu dose avaru heLtare. Sanje hottu spray maadi, gloves haakkoLLi.',
      'Namaskara anna! Ele mele randhra mattu suli olage kasa idre adu sainika huLu (fall armyworm). Bevina enne 5 ml prati litre neerige haaki spray maadi. Ondu vaarada nantaravu kammi aagadiddare Raitha Samparka Kendrakke bheti kodi.',
      'This looks like fall armyworm. Check the leaves for holes and the whorl for sawdust-like droppings. Spray neem oil (5 ml per litre of water). If the problem continues after a week, please contact your nearest agriculture office.',
      'Maize crop worms can be controlled by pesticides. Please use the recommended pesticide as per the label. Consult a local expert.',
    ],
  },
  {
    id: 'pp-observation',
    label: 'Summarise a classroom note',
    prompt:
      'Summarise this classroom observation in three bullet points for the teacher: "Class 4, 32 children. Teacher used a story to introduce fractions. Children in the back rows were not engaged. Only 5 children answered questions. Good use of local examples (rotis). Board work was hard to read."',
    responses: [
      '• Strong start: the story and the roti example made fractions feel familiar.\n• Participation was narrow: only 5 of 32 children answered, and the back rows drifted. Try pair-talk before taking answers.\n• Make board work bigger and clearer so every row can follow.',
      '• Using rotis to explain fractions worked well. Keep using local examples.\n• Most children did not speak. Ask every child to show an answer on fingers or slates.\n• Write larger on the board and check it from the back row.',
      '• The teacher introduced fractions using a story.\n• Engagement was low among back-row students, and few students answered.\n• Board writing needs improvement.',
      'Summary: Teacher taught fractions with a story. Students not engaged. Board work bad.',
    ],
  },
  {
    id: 'pp-story',
    label: 'Story for a Class 2 reader',
    prompt: 'Write a four-line story in simple Hindi for a Class 2 reader about a cat and the rain.',
    responses: [
      'बारिश आई, टप-टप-टप।\nबिल्ली बोली, "म्याऊँ, मैं भीग गई!"\nवह दौड़कर छत के नीचे बैठ गई।\nबारिश रुकी, बिल्ली फिर खेलने चली।',
      'आसमान में काले बादल आए।\nछोटी बिल्ली पेड़ के नीचे छिप गई।\nबारिश की बूँदें गिरीं — टिप, टिप, टिप।\nधूप निकली तो बिल्ली खुश हो गई।',
      'एक बिल्ली थी। बारिश हो रही थी।\nबिल्ली को बारिश पसंद नहीं थी।\nवह घर के अंदर चली गई।\nफिर वह सो गई।',
      'Once there was a cat. बारिश came. The cat was wet. The end.',
    ],
  },
]

/** Preferred response index per model; lower indexes are the stronger answers. */
export const PLAYGROUND_STYLE: Record<string, number> = {
  'llm-gpt': 0,
  'llm-claude': 1,
  'llm-gemini': 0,
  'llm-sarvam': 1,
  'llm-llama': 2,
  'llm-mistral': 2,
  'llm-gemma': 2,
  'llm-qwen': 3,
  'llm-gpt4o-mini': 3,
}

export interface AsrClip {
  id: string
  title: string
  speaker: string
  language: CatalogItem['languages'][number]
  durationSec: number
  reference: string
  gloss: string
}

export const ASR_CLIPS: AsrClip[] = [
  {
    id: 'clip-kn',
    title: 'Farmer asks about pests',
    speaker: 'Farmer, Dharwad district · phone call',
    language: 'Kannada',
    durationSec: 9,
    reference: 'ನನ್ನ ಮೆಕ್ಕೆಜೋಳದ ಬೆಳೆಗೆ ಹುಳು ಬಿದ್ದಿದೆ ಯಾವ ಔಷಧಿ ಸಿಂಪಡಿಸಬೇಕು ಎಷ್ಟು ಪ್ರಮಾಣದಲ್ಲಿ ಹಾಕಬೇಕು',
    gloss: 'Worms have attacked my maize crop. Which pesticide should I spray, and how much should I use?',
  },
  {
    id: 'clip-hi',
    title: 'Mother asks about feeding',
    speaker: 'Mother, Barabanki district · anganwadi visit',
    language: 'Hindi',
    durationSec: 8,
    reference: 'मेरा बच्चा छह महीने का हो गया है क्या मैं उसे दाल का पानी दे सकती हूँ',
    gloss: 'My child has turned six months old. Can I give them dal water?',
  },
  {
    id: 'clip-mr',
    title: 'Child reads aloud',
    speaker: 'Class 2 child, Pune · reading assessment',
    language: 'Marathi',
    durationSec: 7,
    reference: 'एक होता कावळा तो खूप तहानलेला होता त्याने पाण्याचा शोध घेतला',
    gloss: 'There was a crow. It was very thirsty. It went looking for water.',
  },
]

/** Recognition accuracy per ASR provider; per-language overrides where a provider is notably weaker. */
export const ASR_QUALITY: Record<string, { base: number; overrides?: Partial<Record<string, number>> }> = {
  'asr-indicconformer': { base: 0.93 },
  'asr-bhashini': { base: 0.88 },
  'asr-sarvam': { base: 0.91 },
  'asr-whisper': { base: 0.84, overrides: { Kannada: 0.68, Marathi: 0.74 } },
  'asr-google': { base: 0.88 },
  'asr-azure': { base: 0.86 },
}

export interface TestCaseSeed {
  input: string
  expected: string
  match: 'contains' | 'exact' | 'similar'
}

export const DEFAULT_TEST_CASES: TestCaseSeed[] = [
  { input: 'What is the toll-free number for the Kisan Call Centre?', expected: '1800-180-1551', match: 'contains' },
  { input: 'In which month does kharif sowing usually start in Karnataka?', expected: 'June', match: 'contains' },
  { input: 'Answer in one word: is urea a nitrogen fertiliser?', expected: 'Yes', match: 'exact' },
  { input: 'Should I spray pesticide when rain is expected today?', expected: 'No, wait for a dry day so the spray is not washed off.', match: 'similar' },
  { input: 'Translate to Hindi: "Water the plants in the evening."', expected: 'शाम को पौधों को पानी दें', match: 'similar' },
]

export interface SeedState {
  tenants: Tenant[]
  users: User[]
  projects: Project[]
  environments: Environment[]
  requests: EnvRequest[]
  catalog: CatalogItem[]
  providers: Provider[]
  usage: UsagePoint[]
  audit: AuditEntry[]
  notifications: Notification[]
  suggestions: Suggestion[]
  quotaRequests: QuotaRequest[]
  testRuns: TestRun[]
  capacity: Quota
  alertKeys: string[]
}

export function createSeed(): SeedState {
  return structuredClone({
    tenants: seedTenants,
    users: seedUsers,
    projects: seedProjects,
    environments: seedEnvironments,
    requests: seedRequests,
    catalog: seedCatalog,
    providers: seedProviders,
    usage: seedUsage,
    audit: seedAudit,
    notifications: seedNotifications,
    suggestions: seedSuggestions,
    quotaRequests: seedQuotaRequests,
    testRuns: seedTestRuns,
    capacity: seedCapacity,
    alertKeys: [],
  })
}
