export interface EmbeddingsConfig {
  model: string;
  lanceDbPath: string;
}

// TODO: Implement in Phase 2 (Semantic Search)
export class Embeddings {
  constructor(private _config: EmbeddingsConfig) {}
}
