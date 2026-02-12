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
 * @throws Error if text is empty, API key is missing, or API call fails
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

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: input.text,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    // Validate response structure
    if (!response.data || response.data.length === 0) {
      throw new Error('OpenAI API returned empty response')
    }

    const embedding = response.data[0].embedding

    // Validate embedding dimensions
    if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
      throw new Error(
        `Expected ${EMBEDDING_DIMENSIONS}-dimension embedding, got ${embedding?.length || 0}`
      )
    }

    return embedding
  } catch (error) {
    // Re-throw with context if not already our error
    if (error instanceof Error && error.message.startsWith('OpenAI API')) {
      throw error
    }
    if (error instanceof Error && (error.message.startsWith('Text cannot') || error.message.startsWith('Expected'))) {
      throw error
    }
    throw new Error(
      `Failed to generate embedding: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}

/**
 * Generate vector embeddings for multiple texts using OpenAI.
 * More efficient than calling generateEmbedding() multiple times.
 *
 * @param input Array of texts and API key
 * @returns Array of 1536-dimension embedding vectors
 * @throws Error if any text is empty, API key is missing, or API call fails
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

  try {
    const response = await openai.embeddings.create({
      model: EMBEDDING_MODEL,
      input: input.texts,
      dimensions: EMBEDDING_DIMENSIONS,
    })

    // Validate response structure
    if (!response.data || response.data.length !== input.texts.length) {
      throw new Error(
        `OpenAI API returned ${response.data?.length || 0} embeddings, expected ${input.texts.length}`
      )
    }

    // Extract and validate embeddings
    const embeddings = response.data.map((item, index) => {
      if (!item.embedding || item.embedding.length !== EMBEDDING_DIMENSIONS) {
        throw new Error(
          `Embedding at index ${index}: expected ${EMBEDDING_DIMENSIONS} dimensions, got ${item.embedding?.length || 0}`
        )
      }
      return item.embedding
    })

    return embeddings
  } catch (error) {
    // Re-throw with context if not already our error
    if (error instanceof Error && error.message.startsWith('OpenAI API')) {
      throw error
    }
    if (error instanceof Error && (error.message.startsWith('Text at') || error.message.startsWith('Embedding at'))) {
      throw error
    }
    throw new Error(
      `Failed to generate embeddings: ${error instanceof Error ? error.message : String(error)}`
    )
  }
}
