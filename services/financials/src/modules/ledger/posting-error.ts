export class PostingException extends Error {
  constructor(message: string, readonly code: string) {
    super(message);
    this.name = "PostingException";
  }
}
