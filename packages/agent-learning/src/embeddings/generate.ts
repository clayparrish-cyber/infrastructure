import OpenAI from 'openai'

const EMBEDDING_MODEL = 'text-embedding-3-small'
const EMBEDDING_DIMENSIONS = 1536

export interface GenerateEmbeddingInput {
  text: string
  apiKey: string
}

export interface GenerateEmbeddingsInput {
  texts: string[]
  apiKey: string
}

/**
 * Generate a vector embedding for a single text using OpenAI.
 *
 * @param input Text and API key
 * @returns 1536-dimension embedding vector
 * @throws Error if text is empty or API key is missing
 */
export async function generateEmbedding(
  input: GenerateEmbeddingInput
): Promise<number[]> {
  if (!input.apiKey || input.apiKey.trim() === '') {
    throw new Error('OpenAI API key is required')
  }

  if (!input.text || input.text.trim() === '') {
    throw new Error('Text cannot be empty')
  }

  const openai = new OpenAI({ apiKey: input.apiKey })

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: input.text,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return response.data[0].embedding
}

/**
 * Generate vector embeddings for multiple texts using OpenAI.
 * More efficient than calling generateEmbedding() multiple times.
 *
 * @param input Array of texts and API key
 * @returns Array of 1536-dimension embedding vectors
 * @throws Error if any text is empty or API key is missing
 */
export async function generateEmbeddings(
  input: GenerateEmbeddingsInput
): Promise<number[][]> {
  if (!input.apiKey || input.apiKey.trim() === '') {
    throw new Error('OpenAI API key is required')
  }

  if (input.texts.length === 0) {
    return []
  }

  // Validate all texts are non-empty
  const emptyTextIndex = input.texts.findIndex(t => !t || t.trim() === '')
  if (emptyTextIndex !== -1) {
    throw new Error(`Text at index ${emptyTextIndex} cannot be empty`)
  }

  const openai = new OpenAI({ apiKey: input.apiKey })

  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: input.texts,
    dimensions: EMBEDDING_DIMENSIONS,
  })

  return response.data.map(item => item.embedding)
}
