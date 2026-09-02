// Erreur metier avec un code HTTP explicite, interceptee par errorHandler.
export class ApiError extends Error {
  constructor(statusCode, message) {
    super(message)
    this.statusCode = statusCode
  }
}
