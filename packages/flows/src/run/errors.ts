export class DriveNonRetryableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'DriveNonRetryableError'
  }
}
