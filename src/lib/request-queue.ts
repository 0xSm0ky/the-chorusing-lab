/**
 * Request Queue and Rate Limiting
 * Prevents overwhelming Supabase with too many concurrent requests
 */

interface QueuedRequest<T> {
  id: string;
  fn: () => Promise<T>;
  resolve: (value: T) => void;
  reject: (error: any) => void;
  timestamp: number;
}

interface RequestBatch<T> {
  requests: QueuedRequest<T>[];
  timeoutId: NodeJS.Timeout | null;
}

class RequestQueue {
  private queue: QueuedRequest<any>[] = [];
  private processing = false;
  private readonly MAX_CONCURRENT = 10; // Maximum concurrent requests
  private readonly BATCH_DELAY_MS = 50; // Wait 50ms to batch requests
  private readonly MAX_BATCH_SIZE = 20; // Maximum requests per batch
  private currentConcurrent = 0;
  private pendingBatches: Map<string, RequestBatch<any>> = new Map();

  /**
   * Queue a request with optional batching key
   */
  async queueRequest<T>(
    fn: () => Promise<T>,
    options: {
      batchKey?: string; // Requests with same batchKey will be batched together
      priority?: number; // Higher priority = processed first
    } = {}
  ): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const request: QueuedRequest<T> = {
        id: `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        fn,
        resolve,
        reject,
        timestamp: Date.now(),
      };

      // If batching is requested, add to batch
      if (options.batchKey) {
        this.addToBatch(options.batchKey, request);
      } else {
        // Otherwise, add to regular queue
        this.queue.push(request);
      }

      // Start processing if not already
      if (!this.processing) {
        this.processQueue();
      }
    });
  }

  /**
   * Add request to a batch
   */
  private addToBatch<T>(batchKey: string, request: QueuedRequest<T>) {
    let batch = this.pendingBatches.get(batchKey);
    
    if (!batch) {
      batch = {
        requests: [],
        timeoutId: null,
      };
      this.pendingBatches.set(batchKey, batch);
    }

    batch.requests.push(request);

    // If batch is full, process it immediately
    if (batch.requests.length >= this.MAX_BATCH_SIZE) {
      this.processBatch(batchKey);
      return;
    }

    // Otherwise, set a timeout to process the batch
    if (batch.timeoutId) {
      clearTimeout(batch.timeoutId);
    }

    batch.timeoutId = setTimeout(() => {
      this.processBatch(batchKey);
    }, this.BATCH_DELAY_MS);
  }

  /**
   * Process a batch of requests
   */
  private processBatch(batchKey: string) {
    const batch = this.pendingBatches.get(batchKey);
    if (!batch) return;

    if (batch.timeoutId) {
      clearTimeout(batch.timeoutId);
      batch.timeoutId = null;
    }

    // Move batch requests to main queue
    this.queue.push(...batch.requests);
    this.pendingBatches.delete(batchKey);

    // Start processing if not already
    if (!this.processing) {
      this.processQueue();
    }
  }

  /**
   * Process the request queue
   */
  private async processQueue() {
    if (this.processing) return;
    this.processing = true;

    while (this.queue.length > 0 || this.currentConcurrent > 0) {
      // Wait if we're at max concurrent requests
      while (this.currentConcurrent >= this.MAX_CONCURRENT && this.queue.length > 0) {
        await new Promise(resolve => setTimeout(resolve, 10));
      }

      // Process next request
      if (this.queue.length > 0) {
        const request = this.queue.shift();
        if (request) {
          this.currentConcurrent++;
          this.executeRequest(request)
            .finally(() => {
              this.currentConcurrent--;
            });
        }
      } else {
        // No more requests, wait a bit before checking again
        await new Promise(resolve => setTimeout(resolve, 50));
      }
    }

    this.processing = false;
  }

  /**
   * Execute a single request
   */
  private async executeRequest<T>(request: QueuedRequest<T>) {
    try {
      const result = await request.fn();
      request.resolve(result);
    } catch (error) {
      request.reject(error);
    }
  }

  /**
   * Get queue statistics
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      currentConcurrent: this.currentConcurrent,
      pendingBatches: this.pendingBatches.size,
    };
  }

  /**
   * Clear the queue (for testing)
   */
  clear() {
    this.queue = [];
    this.pendingBatches.forEach(batch => {
      if (batch.timeoutId) {
        clearTimeout(batch.timeoutId);
      }
    });
    this.pendingBatches.clear();
  }
}

// Singleton instance
export const requestQueue = new RequestQueue();

/**
 * Rate-limited request wrapper
 */
export async function rateLimitedRequest<T>(
  fn: () => Promise<T>,
  options: {
    batchKey?: string;
    priority?: number;
  } = {}
): Promise<T> {
  return requestQueue.queueRequest(fn, options);
}
