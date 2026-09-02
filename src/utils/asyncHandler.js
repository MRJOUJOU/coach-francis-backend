// Enveloppe un handler async pour transmettre automatiquement les erreurs
// au middleware d'erreurs Express plutot que de faire planter le process.
export function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next)
  }
}
