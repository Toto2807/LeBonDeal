import mongoose from 'mongoose';

const adDetailsSchema = new mongoose.Schema(
  {
    adId: { type: String, required: true },            // UUID de ads.id dans PostgreSQL
    categorySlug: { type: String, required: true },
    attributes: { type: mongoose.Schema.Types.Mixed, required: true, default: {} },
  },
  {
    timestamps: true,
    collection: 'ad_details', // nom explicite : sinon Mongoose pluralise en « addetails »
    minimize: false,          // sinon Mongoose retire un objet vide, et le validateur de la base exige « attributes »
  }
);

export const AdDetails = mongoose.model('AdDetails', adDetailsSchema);
