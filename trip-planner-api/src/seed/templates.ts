/**
 * Checklist rule templates (spec section 4). Seeded into `checklist_templates`
 * by `npm run seed`; the application only reads them.
 */
export const CHECKLIST_TEMPLATES = [
  {
    key: '00-always',
    description: 'Always',
    condition: { always: true },
    items: [
      { label: 'Passport', category: 'documents' },
      { label: 'Phone charger', category: 'electronics' },
      { label: 'Toothbrush', category: 'toiletries' },
      { label: 'Underwear', category: 'clothing', isCountable: true },
      { label: 'Socks', category: 'clothing', isCountable: true },
      { label: 'T-shirts', category: 'clothing', isCountable: true },
      { label: 'Medication', category: 'health' },
    ],
  },
  {
    key: 'beach',
    description: 'tripType = beach',
    condition: { field: 'tripType', op: 'eq', value: 'beach' },
    items: [
      { label: 'Swimsuit', category: 'clothing' },
      { label: 'Sunscreen', category: 'toiletries' },
      { label: 'Beach towel', category: 'gear' },
      { label: 'Flip-flops', category: 'clothing' },
      { label: 'Sunglasses', category: 'gear' },
    ],
  },
  {
    key: 'mountain-hiking',
    description: 'tripType = mountain or activities includes hiking',
    condition: {
      any: [
        { field: 'tripType', op: 'eq', value: 'mountain' },
        { field: 'activities', op: 'includes', value: 'hiking' },
      ],
    },
    items: [
      { label: 'Hiking boots', category: 'clothing' },
      { label: 'Fleece', category: 'clothing' },
      { label: 'Rain jacket', category: 'clothing' },
      { label: 'Headlamp', category: 'gear' },
      { label: 'First-aid kit', category: 'health' },
    ],
  },
  {
    key: 'camping',
    description: 'tripType = camping or accommodation = tent',
    condition: {
      any: [
        { field: 'tripType', op: 'eq', value: 'camping' },
        { field: 'accommodation', op: 'eq', value: 'tent' },
      ],
    },
    items: [
      { label: 'Tent', category: 'gear' },
      { label: 'Sleeping bag', category: 'gear' },
      { label: 'Sleeping mat', category: 'gear' },
      { label: 'Gas stove', category: 'gear' },
      { label: 'Power bank', category: 'electronics' },
    ],
  },
  {
    key: 'diving',
    description: 'activities includes diving',
    condition: { field: 'activities', op: 'includes', value: 'diving' },
    items: [
      { label: 'Diving mask', category: 'gear' },
      { label: 'Wetsuit', category: 'gear' },
      { label: 'Dive log', category: 'documents' },
      { label: 'Certification card', category: 'documents' },
    ],
  },
  {
    key: 'photography',
    description: 'activities includes photography',
    condition: { field: 'activities', op: 'includes', value: 'photography' },
    items: [
      { label: 'Camera', category: 'electronics' },
      { label: 'Spare batteries', category: 'electronics' },
      { label: 'Memory cards', category: 'electronics' },
      { label: 'Tripod', category: 'gear' },
    ],
  },
  {
    key: 'transport-plane',
    description: 'transport = plane',
    condition: { field: 'transport', op: 'eq', value: 'plane' },
    items: [
      { label: 'Boarding pass', category: 'documents' },
      { label: 'Cabin-size liquids bag', category: 'toiletries' },
      { label: 'Travel pillow', category: 'gear' },
    ],
  },
  {
    key: 'transport-car',
    description: 'transport = car',
    condition: { field: 'transport', op: 'eq', value: 'car' },
    items: [
      { label: 'Driving licence', category: 'documents' },
      { label: 'Green card insurance', category: 'documents' },
      { label: 'Phone mount', category: 'electronics' },
    ],
  },
  {
    key: 'infants',
    description: 'travellers.infants > 0 or special need "with a baby"',
    condition: {
      any: [
        { field: 'travellers.infants', op: 'gt', value: 0 },
        { field: 'specialNeeds', op: 'includes', value: 'with a baby' },
      ],
    },
    items: [
      { label: 'Nappies', category: 'baby' },
      { label: 'Baby food', category: 'baby' },
      { label: 'Pushchair', category: 'baby' },
      { label: 'Baby wipes', category: 'baby' },
    ],
  },
  {
    key: 'season-winter',
    description: 'season = winter',
    condition: { field: 'season', op: 'eq', value: 'winter' },
    items: [
      { label: 'Coat', category: 'clothing' },
      { label: 'Gloves', category: 'clothing' },
      { label: 'Hat', category: 'clothing' },
      { label: 'Thermal layers', category: 'clothing' },
    ],
  },
  {
    key: 'abroad',
    description: 'Destination differs from home country',
    condition: { field: 'isAbroad', op: 'eq', value: true },
    items: [
      { label: 'Power adapter', category: 'electronics' },
      { label: 'Local currency', category: 'money' },
      { label: 'Travel insurance', category: 'documents' },
      { label: 'Roaming plan', category: 'electronics' },
    ],
  },
  // --- extra rules on the same model (special needs and activities not covered above)
  {
    key: 'special-formal-event',
    description: 'specialNeeds includes formal event, or tripType = business',
    condition: {
      any: [
        { field: 'specialNeeds', op: 'includes', value: 'formal event' },
        { field: 'tripType', op: 'eq', value: 'business' },
      ],
    },
    items: [
      { label: 'Formal outfit', category: 'clothing' },
      { label: 'Dress shoes', category: 'clothing' },
    ],
  },
  {
    key: 'special-driving-abroad',
    description: 'specialNeeds includes driving abroad',
    condition: { field: 'specialNeeds', op: 'includes', value: 'driving abroad' },
    items: [
      { label: 'International driving permit', category: 'documents' },
      { label: 'Driving licence', category: 'documents' },
    ],
  },
  {
    key: 'special-modest-dress',
    description: 'specialNeeds includes modest dress required, or tripType = pilgrimage',
    condition: {
      any: [
        { field: 'specialNeeds', op: 'includes', value: 'modest dress required' },
        { field: 'tripType', op: 'eq', value: 'pilgrimage' },
      ],
    },
    items: [
      { label: 'Long-sleeved tops', category: 'clothing' },
      { label: 'Long trousers or skirt', category: 'clothing' },
      { label: 'Scarf', category: 'clothing' },
    ],
  },
  {
    key: 'business',
    description: 'tripType = business',
    condition: { field: 'tripType', op: 'eq', value: 'business' },
    items: [
      { label: 'Laptop and charger', category: 'electronics' },
      { label: 'Business cards', category: 'documents' },
    ],
  },
  {
    key: 'skiing',
    description: 'activities includes skiing',
    condition: { field: 'activities', op: 'includes', value: 'skiing' },
    items: [
      { label: 'Ski jacket', category: 'clothing' },
      { label: 'Ski goggles', category: 'gear' },
      { label: 'Thermal layers', category: 'clothing' },
      { label: 'Lip balm', category: 'toiletries' },
    ],
  },
  {
    key: 'swimming',
    description: 'activities includes swimming',
    condition: { field: 'activities', op: 'includes', value: 'swimming' },
    items: [
      { label: 'Swimsuit', category: 'clothing' },
      { label: 'Swimming goggles', category: 'gear' },
    ],
  },
  {
    key: 'season-summer',
    description: 'season = summer',
    condition: { field: 'season', op: 'eq', value: 'summer' },
    items: [
      { label: 'Sunscreen', category: 'toiletries' },
      { label: 'Sun hat', category: 'clothing' },
      { label: 'Reusable water bottle', category: 'gear' },
    ],
  },
];
