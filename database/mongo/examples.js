// Requêtes MongoDB types de LeBonDeal (mongosh, base « lebondeal »).
// Les identifiants sont des UUID PostgreSQL (chaînes), sauf conversationId qui est un ObjectId MongoDB.

const buyerId = '00000000-0000-0000-0000-0000000000b1';
const sellerId = '00000000-0000-0000-0000-0000000000a1';
const adId = '11111111-1111-1111-1111-111111111111';

// ── 1. Messagerie ────────────────────────────────────────────────────────────
// Ouvrir (ou retrouver) la conversation acheteur ↔ annonce : l'index unique { adId, buyerId } évite les doublons.
const conv = db.conversations.findOneAndUpdate(
  { adId, buyerId },
  { $setOnInsert: { adId, buyerId, sellerId, participants: [buyerId, sellerId],
                    adSnapshot: { title: 'Peugeot 208', priceCents: 900000 }, unread: {}, createdAt: new Date() } },
  { upsert: true, returnDocument: 'after' }
);

// Envoyer un message : on l'insère, puis on met à jour l'aperçu et le compteur de non-lus du destinataire.
const now = new Date();
db.messages.insertOne({ conversationId: conv._id, senderId: buyerId, type: 'text',
                        text: 'Bonjour, est-ce toujours disponible ?', readAt: null, createdAt: now });
db.conversations.updateOne({ _id: conv._id }, {
  $set: { lastMessage: { text: 'Bonjour, est-ce toujours disponible ?', senderId: buyerId, at: now }, updatedAt: now },
  $inc: { [`unread.${sellerId}`]: 1 },
});

// Boîte de réception d'un utilisateur : ses conversations, les plus récentes d'abord.
db.conversations.find({ participants: sellerId }).sort({ updatedAt: -1 }).limit(20).toArray();

// Historique d'une conversation, 30 messages à la fois (« charger plus » : passer le createdAt du plus ancien dans `before`).
const before = new Date();
db.messages.find({ conversationId: conv._id, createdAt: { $lt: before } }).sort({ createdAt: -1 }).limit(30).toArray();

// Marquer comme lus : les messages de l'autre personne + le compteur de non-lus de l'utilisateur.
db.messages.updateMany({ conversationId: conv._id, senderId: { $ne: sellerId }, readAt: null }, { $set: { readAt: new Date() } });
db.conversations.updateOne({ _id: conv._id }, { $set: { [`unread.${sellerId}`]: 0 } });

// ── 2. Champs dynamiques par catégorie ───────────────────────────────────────
// Formulaire et filtres du frontend : la définition des champs d'une catégorie.
db.category_schemas.findOne({ categorySlug: 'voitures' });

// Filtre de recherche : voitures diesel ou hybrides, moins de 100 000 km.
// Résultat = liste d'identifiants, à passer à PostgreSQL (WHERE id = ANY($1::uuid[])) avec les autres filtres.
db.ad_details.find(
  { categorySlug: 'voitures', 'attributes.carburant': { $in: ['Diesel', 'Hybride'] }, 'attributes.kilometrage': { $lte: 100000 } },
  { adId: 1, _id: 0 }
).limit(1000).toArray().map((d) => d.adId);

// ── 3. Statistiques ──────────────────────────────────────────────────────────
// Vues d'une annonce par jour (tableau de bord vendeur).
const since = new Date(Date.now() - 30 * 24 * 3600 * 1000);
db.ad_views.aggregate([
  { $match: { adId, at: { $gte: since } } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$at' } },
              views: { $sum: 1 }, visitors: { $addToSet: '$sessionId' } } },
  { $project: { views: 1, uniqueVisitors: { $size: '$visitors' } } },
  { $sort: { _id: 1 } },
]).toArray();

// Recherches les plus fréquentes (suggestions du champ de recherche).
db.search_events.aggregate([
  { $match: { at: { $gte: since }, q: { $ne: '' } } },
  { $group: { _id: { $toLower: '$q' }, count: { $sum: 1 } } },
  { $sort: { count: -1 } },
  { $limit: 10 },
]).toArray();
