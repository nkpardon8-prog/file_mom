/** Base error class for FileMom */
export class FileMomError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly recoverable: boolean = false,
    public readonly details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'FileMomError';
  }
}

export class ScanError extends FileMomError {
  constructor(path: string, cause: Error) {
    super(`Failed to scan: ${path}`, 'SCAN_ERROR', true, {
      path,
      cause: cause.message,
    });
  }
}

export class ExtractionError extends FileMomError {
  constructor(path: string, cause: Error) {
    super(`Failed to extract metadata: ${path}`, 'EXTRACTION_ERROR', true, {
      path,
      cause: cause.message,
    });
  }
}

export class AIError extends FileMomError {
  constructor(message: string, cause?: Error) {
    super(message, 'AI_ERROR', true, {
      cause: cause?.message,
    });
  }
}

export class ExecutionError extends FileMomError {
  constructor(actionId: string, message: string, cause?: Error) {
    super(message, 'EXECUTION_ERROR', false, {
      actionId,
      cause: cause?.message,
    });
  }
}

export class ValidationError extends FileMomError {
  constructor(message: string, issues: string[]) {
    super(message, 'VALIDATION_ERROR', false, {
      issues,
    });
  }
}

export class WatcherError extends FileMomError {
  constructor(message: string, cause?: Error) {
    super(message, 'WATCHER_ERROR', true, {
      cause: cause?.message,
    });
  }
}

export class EmbeddingError extends FileMomError {
  constructor(message: string, cause?: Error) {
    super(message, 'EMBEDDING_ERROR', true, {
      cause: cause?.message,
    });
  }
}
