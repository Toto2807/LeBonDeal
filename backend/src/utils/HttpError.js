// Erreur « attendue » : le middleware errorHandler la transforme en réponse JSON avec le bon code HTTP.
export class HttpError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
  }
}
