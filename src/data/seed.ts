import type {
  Activity,
  CatalogItem,
  EnvRequest,
  EnvSpec,
  Environment,
  Notification,
  Provider,
  Tenant,
  UsagePoint,
  User,
} from './types'

export const DEMO_ADMIN_ID = 'u-rohan'
export const DEMO_USER_ID = 'u-ananya'

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

function daysAgo(days: number, hour = 10, minute = 0) {
  const d = new Date(Date.now() - days * DAY)
  d.setHours(hour, minute, 0, 0)
  return d.toISOString()
}

function daysAhead(days: number) {
  return new Date(Date.now() + days * DAY).toISOString()
}

function apiKey(seed: string) {
  const rand = seededRandom(hashString(seed))
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789'
  let out = 'aic_live_'
  for (let i = 0; i < 32; i++) out += chars[Math.floor(rand() * chars.length)]
  return out
}

export function endpointFor(tenantSlug: string, envId: string) {
  return `https://${tenantSlug}.aicommons.example/v1/envs/${envId}`
}

/* ---------- tenants ---------- */

export const seedTenants: Tenant[] = [
  {
    id: 't-pratham',
    name: 'Pratham Learning Labs',
    shortName: 'pratham-labs',
    orgType: 'NGO',
    city: 'Mumbai',
    state: 'Maharashtra',
    contactName: 'Arjun Deshpande',
    contactEmail: 'arjun.deshpande@prathamlabs.org',
    creditQuota: 120000,
    creditsUsed: 64800,
    gpuQuota: 600,
    gpuUsed: 310,
    allowedCapabilities: ['llm', 'asr', 'agent-framework', 'vector-db', 'evaluation', 'low-code'],
    status: 'active',
    createdAt: daysAgo(210),
  },
  {
    id: 't-tfb',
    name: 'Teach For Bharat',
    shortName: 'teach-for-bharat',
    orgType: 'NGO',
    city: 'Pune',
    state: 'Maharashtra',
    contactName: 'Kavya Iyer',
    contactEmail: 'kavya.iyer@teachforbharat.org',
    creditQuota: 80000,
    creditsUsed: 31200,
    gpuQuota: 300,
    gpuUsed: 96,
    allowedCapabilities: ['llm', 'agent-framework', 'vector-db', 'evaluation', 'low-code'],
    status: 'active',
    createdAt: daysAgo(160),
  },
  {
    id: 't-kisan',
    name: 'Kisan Voice Foundation',
    shortName: 'kisan-voice',
    orgType: 'Social enterprise',
    city: 'Dharwad',
    state: 'Karnataka',
    contactName: 'Ananya Rao',
    contactEmail: 'ananya.rao@kisanvoice.org',
    creditQuota: 60000,
    creditsUsed: 49200,
    gpuQuota: 400,
    gpuUsed: 220,
    allowedCapabilities: ['llm', 'asr', 'agent-framework', 'vector-db', 'evaluation'],
    status: 'active',
    createdAt: daysAgo(120),
  },
  {
    id: 't-anganwadi',
    name: 'Anganwadi Digital',
    shortName: 'anganwadi-digital',
    orgType: 'Government partner',
    city: 'Lucknow',
    state: 'Uttar Pradesh',
    contactName: 'Pooja Verma',
    contactEmail: 'pooja.verma@anganwadidigital.in',
    creditQuota: 50000,
    creditsUsed: 47900,
    gpuQuota: 200,
    gpuUsed: 118,
    allowedCapabilities: ['llm', 'asr', 'vector-db', 'evaluation'],
    status: 'active',
    createdAt: daysAgo(90),
  },
]

/* ---------- users ---------- */

export const seedUsers: User[] = [
  { id: 'u-rohan', name: 'Rohan Mehta', email: 'rohan.mehta@shikshalokam.org', title: 'Platform lead', tenantId: null, role: 'admin', status: 'active', lastActiveAt: daysAgo(0, 9, 12) },
  { id: 'u-lakshmi', name: 'Lakshmi Narayanan', email: 'lakshmi.n@shikshalokam.org', title: 'Partner success', tenantId: null, role: 'admin', status: 'active', lastActiveAt: daysAgo(1, 17, 40) },
  { id: 'u-ananya', name: 'Ananya Rao', email: 'ananya.rao@kisanvoice.org', title: 'ML engineer', tenantId: 't-kisan', role: 'user', status: 'active', lastActiveAt: daysAgo(0, 8, 55) },
  { id: 'u-basavaraj', name: 'Basavaraj Patil', email: 'basavaraj.patil@kisanvoice.org', title: 'Backend developer', tenantId: 't-kisan', role: 'user', status: 'active', lastActiveAt: daysAgo(2, 14, 5) },
  { id: 'u-shruti', name: 'Shruti Hegde', email: 'shruti.hegde@kisanvoice.org', title: 'Product manager', tenantId: 't-kisan', role: 'user', status: 'active', lastActiveAt: daysAgo(5, 11, 20) },
  { id: 'u-arjun', name: 'Arjun Deshpande', email: 'arjun.deshpande@prathamlabs.org', title: 'Tech lead', tenantId: 't-pratham', role: 'user', status: 'active', lastActiveAt: daysAgo(0, 10, 30) },
  { id: 'u-meera', name: 'Meera Kulkarni', email: 'meera.kulkarni@prathamlabs.org', title: 'Data scientist', tenantId: 't-pratham', role: 'user', status: 'active', lastActiveAt: daysAgo(1, 16, 45) },
  { id: 'u-imran', name: 'Imran Shaikh', email: 'imran.shaikh@prathamlabs.org', title: 'Developer', tenantId: 't-pratham', role: 'user', status: 'deactivated', lastActiveAt: daysAgo(48, 12, 0) },
  { id: 'u-kavya', name: 'Kavya Iyer', email: 'kavya.iyer@teachforbharat.org', title: 'Engineering manager', tenantId: 't-tfb', role: 'user', status: 'active', lastActiveAt: daysAgo(0, 7, 50) },
  { id: 'u-siddharth', name: 'Siddharth Joshi', email: 'siddharth.joshi@teachforbharat.org', title: 'Developer', tenantId: 't-tfb', role: 'user', status: 'active', lastActiveAt: daysAgo(3, 15, 10) },
  { id: 'u-pooja', name: 'Pooja Verma', email: 'pooja.verma@anganwadidigital.in', title: 'Programme technologist', tenantId: 't-anganwadi', role: 'user', status: 'active', lastActiveAt: daysAgo(1, 9, 25) },
  { id: 'u-rahul', name: 'Rahul Srivastava', email: 'rahul.srivastava@anganwadidigital.in', title: 'Developer', tenantId: 't-anganwadi', role: 'user', status: 'active', lastActiveAt: daysAgo(4, 13, 35) },
]

/* ---------- catalog ---------- */

const ALL_LANGS: CatalogItem['languages'] = ['Hindi', 'Kannada', 'Tamil', 'Telugu', 'Marathi', 'Bengali', 'English']

export const seedCatalog: CatalogItem[] = [
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

/* ---------- environments and requests ---------- */

const baseSpec: EnvSpec = {
  name: '',
  description: '',
  purpose: 'development',
  durationWeeks: 8,
  compute: 't4',
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

interface EnvSeed {
  id: string
  tenantId: string
  ownerId: string
  status: Environment['status']
  createdDaysAgo: number
  creditsUsed: number
  spec: EnvSpec
}

const tenantSlug = (tenantId: string) => seedTenants.find((t) => t.id === tenantId)!.shortName

const envSeeds: EnvSeed[] = [
  {
    id: 'env-kv-advisory', tenantId: 't-kisan', ownerId: 'u-ananya', status: 'running', createdDaysAgo: 34, creditsUsed: 18400,
    spec: spec({ name: 'Crop advisory voice bot', description: 'Farmers ask questions by phone in Kannada and Hindi and get spoken advice on pests, sowing and weather.', purpose: 'development', compute: 'a10', storageGb: 200, llms: [{ id: 'llm-sarvam', tokenBudget: 4 }, { id: 'llm-llama', tokenBudget: 6 }], asr: ['asr-indicconformer', 'asr-bhashini'], languages: ['Kannada', 'Hindi'], asrHoursPerMonth: 40, capabilities: ['cap-langgraph', 'cap-qdrant'], justification: 'Core product for the kharif season. We need Kannada speech recognition close to our farmers.' }),
  },
  {
    id: 'env-kv-mandi', tenantId: 't-kisan', ownerId: 'u-basavaraj', status: 'stopped', createdDaysAgo: 26, creditsUsed: 6200,
    spec: spec({ name: 'Mandi price Q&A evaluation', description: 'Compare answer quality for mandi price questions across two hosted models.', purpose: 'evaluation', compute: 't4', storageGb: 50, durationWeeks: 4, llms: [{ id: 'llm-gpt', tokenBudget: 2 }, { id: 'llm-gemini', tokenBudget: 2 }], capabilities: ['cap-ragas', 'cap-pgvector'], dataClassification: 'public', justification: 'Choose a model for the price helpline before the rabi season.' }),
  },
  {
    id: 'env-kv-pilot', tenantId: 't-kisan', ownerId: 'u-shruti', status: 'rejected', createdDaysAgo: 12, creditsUsed: 0,
    spec: spec({ name: 'Farmer helpline pilot, Dharwad', description: 'Pilot the voice bot with 500 farmers across three taluks in Dharwad district.', purpose: 'pilot', compute: 'a10', storageGb: 300, durationWeeks: 12, autoShutdownHours: 0, llms: [{ id: 'llm-sarvam', tokenBudget: 10 }], asr: ['asr-indicconformer'], languages: ['Kannada'], asrHoursPerMonth: 120, capabilities: ['cap-langgraph', 'cap-qdrant'], dataClassification: 'personal', containsPii: true, justification: 'Field pilot with farmer producer organisations.' }),
  },
  {
    id: 'env-pr-fluency', tenantId: 't-pratham', ownerId: 'u-meera', status: 'running', createdDaysAgo: 58, creditsUsed: 31200,
    spec: spec({ name: 'Reading fluency assessment', description: 'Score oral reading recordings from children in Hindi and Marathi for words-correct-per-minute.', purpose: 'evaluation', compute: 'a100', storageGb: 250, durationWeeks: 12, llms: [{ id: 'llm-gemma', tokenBudget: 3 }], asr: ['asr-indicconformer', 'asr-whisper'], languages: ['Hindi', 'Marathi'], asrHoursPerMonth: 200, capabilities: ['cap-deepeval'], dataClassification: 'children', containsPii: true, justification: 'Replace manual scoring for the annual learning assessment.' }),
  },
  {
    id: 'env-pr-lessonplan', tenantId: 't-pratham', ownerId: 'u-arjun', status: 'running', createdDaysAgo: 44, creditsUsed: 14600,
    spec: spec({ name: 'Teacher lesson-plan assistant', description: 'Helps teachers draft activity-based lesson plans from the state textbook.', purpose: 'development', compute: 't4', storageGb: 100, llms: [{ id: 'llm-claude', tokenBudget: 3 }, { id: 'llm-gpt', tokenBudget: 2 }], capabilities: ['cap-llamaindex', 'cap-chroma', 'cap-promptfoo'], dataClassification: 'internal', justification: 'Teachers asked for help planning combined-grade classes.' }),
  },
  {
    id: 'env-pr-loadtest', tenantId: 't-pratham', ownerId: 'u-arjun', status: 'pending', createdDaysAgo: 1, creditsUsed: 0,
    spec: spec({ name: 'Lesson-plan assistant load test', description: 'Check that the assistant holds up for 2,000 teachers during the training week.', purpose: 'load-testing', compute: 'a10', storageGb: 50, durationWeeks: 2, llms: [{ id: 'llm-claude', tokenBudget: 6 }], capabilities: ['cap-llamaindex', 'cap-chroma'], justification: 'District training starts on the 20th. We need to know our limits before then.' }),
  },
  {
    id: 'env-tfb-coach', tenantId: 't-tfb', ownerId: 'u-kavya', status: 'running', createdDaysAgo: 70, creditsUsed: 9800,
    spec: spec({ name: 'Fellow coaching chatbot', description: 'Answers fellows’ questions on classroom management using the programme handbook.', purpose: 'development', compute: 'cpu', storageGb: 50, llms: [{ id: 'llm-claude', tokenBudget: 1 }, { id: 'llm-mistral', tokenBudget: 4 }], capabilities: ['cap-crewai', 'cap-weaviate'], justification: 'Coaches can reach only a third of fellows each week.' }),
  },
  {
    id: 'env-tfb-observe', tenantId: 't-tfb', ownerId: 'u-siddharth', status: 'approved', createdDaysAgo: 3, creditsUsed: 0,
    spec: spec({ name: 'Classroom observation summariser', description: 'Turns observation notes into a structured feedback summary for fellows.', purpose: 'functional-testing', compute: 't4', storageGb: 50, durationWeeks: 4, llms: [{ id: 'llm-gemini', tokenBudget: 2 }], capabilities: ['cap-promptfoo'], justification: 'Test with last term’s anonymised notes before rollout.' }),
  },
  {
    id: 'env-tfb-stories', tenantId: 't-tfb', ownerId: 'u-kavya', status: 'provisioning', createdDaysAgo: 2, creditsUsed: 0,
    spec: spec({ name: 'Tamil storytelling generator', description: 'Generates short graded-level stories in Tamil for early readers.', purpose: 'development', compute: 't4', storageGb: 50, durationWeeks: 6, llms: [{ id: 'llm-gemma', tokenBudget: 3 }, { id: 'llm-sarvam', tokenBudget: 2 }], languages: ['Tamil'], capabilities: ['cap-promptfoo'], dataClassification: 'public', justification: 'Fellows in Chennai need more Tamil reading material.' }),
  },
  {
    id: 'env-ang-nutrition', tenantId: 't-anganwadi', ownerId: 'u-pooja', status: 'running', createdDaysAgo: 40, creditsUsed: 22100,
    spec: spec({ name: 'Nutrition counselling assistant', description: 'Helps anganwadi workers counsel mothers on infant feeding, in Hindi.', purpose: 'pilot', compute: 'a10', storageGb: 150, durationWeeks: 12, llms: [{ id: 'llm-gpt', tokenBudget: 5 }], asr: ['asr-bhashini'], languages: ['Hindi'], asrHoursPerMonth: 30, capabilities: ['cap-pgvector', 'cap-ragas'], dataClassification: 'personal', containsPii: true, justification: 'Pilot in 40 anganwadi centres in Barabanki district.' }),
  },
  {
    id: 'env-ang-growth', tenantId: 't-anganwadi', ownerId: 'u-rahul', status: 'stopped', createdDaysAgo: 30, creditsUsed: 5400,
    spec: spec({ name: 'Growth-chart voice notes', description: 'Workers record child growth measurements by voice instead of on paper.', purpose: 'evaluation', compute: 't4', storageGb: 50, durationWeeks: 4, llms: [{ id: 'llm-mistral', tokenBudget: 2 }], asr: ['asr-bhashini', 'asr-whisper'], languages: ['Hindi'], asrHoursPerMonth: 15, dataClassification: 'children', containsPii: true, justification: 'Reduce register-keeping time for workers.' }),
  },
  {
    id: 'env-ang-transcribe', tenantId: 't-anganwadi', ownerId: 'u-rahul', status: 'pending', createdDaysAgo: 0, creditsUsed: 0,
    spec: spec({ name: 'Worker voice notes transcription', description: 'Transcribe daily voice notes from 300 workers to track home visits.', purpose: 'development', compute: 'a10', storageGb: 200, durationWeeks: 8, llms: [{ id: 'llm-gpt', tokenBudget: 4 }], asr: ['asr-indicconformer', 'asr-google'], languages: ['Hindi'], asrHoursPerMonth: 60, capabilities: ['cap-pgvector'], dataClassification: 'personal', containsPii: true, justification: 'Supervisors want visit data without extra paperwork.' }),
  },
]

function timelineFor(e: EnvSeed): Environment['timeline'] {
  const d = e.createdDaysAgo
  const t: Environment['timeline'] = [{ status: 'pending', at: daysAgo(d, 10, 5), note: 'Request submitted' }]
  if (e.status === 'rejected') {
    t.push({ status: 'rejected', at: daysAgo(Math.max(d - 1, 0), 15, 20), note: 'Rejected by Rohan Mehta' })
    return t
  }
  if (e.status === 'pending') return t
  t.push({ status: 'approved', at: daysAgo(Math.max(d - 1, 0), 11, 30), note: 'Approved by Rohan Mehta' })
  if (e.status === 'approved') return t
  t.push({ status: 'provisioning', at: daysAgo(Math.max(d - 1, 0), 11, 31) })
  if (e.status === 'provisioning') return t
  t.push({ status: 'running', at: daysAgo(Math.max(d - 1, 0), 11, 36) })
  if (e.status === 'stopped') t.push({ status: 'stopped', at: daysAgo(3, 18, 0), note: 'Stopped by owner' })
  return t
}

export const seedEnvironments: Environment[] = envSeeds.map((e) => ({
  id: e.id,
  tenantId: e.tenantId,
  ownerId: e.ownerId,
  requestId: `req-${e.id.slice(4)}`,
  status: e.status,
  spec: e.spec,
  endpoint: endpointFor(tenantSlug(e.tenantId), e.id),
  apiKey: apiKey(e.id),
  creditsUsed: e.creditsUsed,
  createdAt: daysAgo(e.createdDaysAgo, 10, 5),
  expiresAt: e.status === 'pending' || e.status === 'rejected' ? null : daysAhead(e.spec.durationWeeks * 7 - e.createdDaysAgo),
  timeline: timelineFor(e),
}))

export const seedRequests: EnvRequest[] = [
  ...envSeeds.map((e): EnvRequest => {
    const decided = e.status !== 'pending'
    const rejected = e.status === 'rejected'
    const base: EnvRequest = {
      id: `req-${e.id.slice(4)}`,
      type: 'new',
      tenantId: e.tenantId,
      requesterId: e.ownerId,
      envId: e.id,
      spec: e.spec,
      previousSpec: null,
      status: rejected ? 'rejected' : decided ? 'approved' : 'pending',
      createdAt: daysAgo(e.createdDaysAgo, 10, 5),
      decidedAt: decided ? daysAgo(Math.max(e.createdDaysAgo - 1, 0), rejected ? 15 : 11, rejected ? 20 : 30) : null,
      decidedById: decided ? 'u-rohan' : null,
      adminChanges: [],
      rejectionReason: null,
      comments: [],
    }
    if (e.id === 'env-kv-pilot') {
      base.rejectionReason = 'A pilot with farmers’ personal data needs a signed data-processing agreement first. Attach the DPA and submit the request again.'
    }
    if (e.id === 'env-pr-fluency') {
      base.spec = { ...e.spec }
      base.adminChanges = [{ field: 'Storage', from: '500 GB', to: '250 GB' }]
      base.comments = [
        { id: 'c-1', authorId: 'u-rohan', text: 'Approved with 250 GB storage. Recordings older than 30 days can move to cold storage. Ask if you need more.', at: daysAgo(57, 11, 32) },
        { id: 'c-2', authorId: 'u-meera', text: 'That works for us. Thank you.', at: daysAgo(57, 14, 2) },
      ]
    }
    if (e.id === 'env-pr-loadtest') {
      base.comments = [{ id: 'c-3', authorId: 'u-arjun', text: 'We only need the A10 for the training week. Happy to stop it right after.', at: daysAgo(1, 10, 20) }]
    }
    return base
  }),
  {
    id: 'req-change-lessonplan',
    type: 'change',
    tenantId: 't-pratham',
    requesterId: 'u-arjun',
    envId: 'env-pr-lessonplan',
    previousSpec: envSeeds.find((e) => e.id === 'env-pr-lessonplan')!.spec,
    spec: { ...envSeeds.find((e) => e.id === 'env-pr-lessonplan')!.spec, llms: [{ id: 'llm-claude', tokenBudget: 8 }, { id: 'llm-gpt', tokenBudget: 2 }], justification: 'Usage tripled after the Nashik teacher workshop.' },
    status: 'pending',
    createdAt: daysAgo(0, 9, 40),
    decidedAt: null,
    decidedById: null,
    adminChanges: [],
    rejectionReason: null,
    comments: [],
  },
]

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
  't-pratham': { credits: 2300, gpu: 11, calls: 14000 },
  't-tfb': { credits: 1100, gpu: 3.5, calls: 6200 },
  't-kisan': { credits: 1650, gpu: 7.5, calls: 9100 },
  't-anganwadi': { credits: 1550, gpu: 4, calls: 7400 },
}

export const seedUsage: UsagePoint[] = (() => {
  const out: UsagePoint[] = []
  for (const tenant of seedTenants) {
    const rand = seededRandom(hashString(tenant.id))
    const p = usageProfile[tenant.id]
    for (let i = 29; i >= 0; i--) {
      const d = new Date(Date.now() - i * DAY)
      const weekend = d.getDay() === 0 || d.getDay() === 6
      const growth = 0.75 + ((29 - i) / 29) * 0.4
      const f = (weekend ? 0.45 : 1) * growth * (0.85 + rand() * 0.3)
      out.push({
        date: d.toISOString().slice(0, 10),
        tenantId: tenant.id,
        credits: Math.round(p.credits * f),
        gpuHours: Math.round(p.gpu * f * 10) / 10,
        apiCalls: Math.round(p.calls * f),
      })
    }
  }
  return out
})()

/* ---------- activity and notifications ---------- */

export const seedActivity: Activity[] = [
  { id: 'a-1', at: daysAgo(0, 9, 40), actorId: 'u-arjun', tenantId: 't-pratham', kind: 'request', text: 'Arjun Deshpande requested a change to “Teacher lesson-plan assistant”' },
  { id: 'a-2', at: daysAgo(0, 8, 15), actorId: 'u-rahul', tenantId: 't-anganwadi', kind: 'request', text: 'Rahul Srivastava requested “Worker voice notes transcription”' },
  { id: 'a-3', at: daysAgo(1, 17, 5), actorId: 'u-lakshmi', tenantId: null, kind: 'provider', text: 'Lakshmi Narayanan disabled Azure AI Speech after repeated timeouts' },
  { id: 'a-4', at: daysAgo(1, 11, 31), actorId: 'u-rohan', tenantId: 't-tfb', kind: 'approval', text: 'Rohan Mehta approved “Tamil storytelling generator” for Teach For Bharat' },
  { id: 'a-5', at: daysAgo(1, 10, 5), actorId: 'u-arjun', tenantId: 't-pratham', kind: 'request', text: 'Arjun Deshpande requested “Lesson-plan assistant load test”' },
  { id: 'a-6', at: daysAgo(2, 11, 30), actorId: 'u-rohan', tenantId: 't-tfb', kind: 'approval', text: 'Rohan Mehta approved “Classroom observation summariser” for Teach For Bharat' },
  { id: 'a-7', at: daysAgo(3, 18, 0), actorId: 'u-basavaraj', tenantId: 't-kisan', kind: 'environment', text: 'Basavaraj Patil stopped “Mandi price Q&A evaluation”' },
  { id: 'a-8', at: daysAgo(4, 16, 20), actorId: 'u-meera', tenantId: 't-pratham', kind: 'test', text: 'Meera Kulkarni ran a load test on “Reading fluency assessment”: passed at 200 virtual users' },
  { id: 'a-9', at: daysAgo(6, 12, 10), actorId: 'u-rohan', tenantId: null, kind: 'catalog', text: 'Rohan Mehta marked GPT-4o mini as deprecated' },
  { id: 'a-10', at: daysAgo(11, 15, 20), actorId: 'u-rohan', tenantId: 't-kisan', kind: 'rejection', text: 'Rohan Mehta rejected “Farmer helpline pilot, Dharwad”: data-processing agreement needed' },
]

export const seedNotifications: Notification[] = [
  { id: 'n-1', userId: 'u-ananya', at: daysAgo(3, 18, 0), text: 'Basavaraj Patil stopped “Mandi price Q&A evaluation”.', link: '/app/environments/env-kv-mandi', read: false },
  { id: 'n-2', userId: 'u-ananya', at: daysAgo(11, 15, 20), text: '“Farmer helpline pilot, Dharwad” was rejected. A data-processing agreement is needed.', link: '/app/requests', read: true },
  { id: 'n-3', userId: 'u-ananya', at: daysAgo(20, 9, 0), text: 'Your organisation has used 80% of this month’s credits.', link: null, read: true },
  { id: 'n-4', userId: 'u-rohan', at: daysAgo(0, 9, 40), text: 'New change request from Pratham Learning Labs.', link: '/admin/requests', read: false },
  { id: 'n-5', userId: 'u-rohan', at: daysAgo(0, 8, 15), text: 'New request from Anganwadi Digital exceeds its credit quota.', link: '/admin/requests', read: false },
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
  environments: Environment[]
  requests: EnvRequest[]
  catalog: CatalogItem[]
  providers: Provider[]
  usage: UsagePoint[]
  activity: Activity[]
  notifications: Notification[]
}

export function createSeed(): SeedState {
  return structuredClone({
    tenants: seedTenants,
    users: seedUsers,
    environments: seedEnvironments,
    requests: seedRequests,
    catalog: seedCatalog,
    providers: seedProviders,
    usage: seedUsage,
    activity: seedActivity,
    notifications: seedNotifications,
  })
}
