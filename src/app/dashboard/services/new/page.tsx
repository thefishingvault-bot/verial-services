'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

// As per schema: serviceCategoryEnum
const categories = [
  "cleaning",
  "plumbing",
  "gardening",
  "it_support",
  "accounting",
  "detailing",
  "other"
];

export default function NewServicePage() {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [price, setPrice] = useState('');
  const [category, setCategory] = useState(categories[0]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      // Convert price in dollars (e.g., 150.50) to cents
      const priceInCents = Math.round(parseFloat(price) * 100);
      if (isNaN(priceInCents) || priceInCents <= 0) {
        throw new Error('Price must be a positive number.');
      }

      const res = await fetch('/api/services/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, description, priceInCents, category }),
      });

      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to create service.');
      }

      // Service created! Redirect to the provider's main dashboard (for now).
      alert('Service created successfully!');
      router.push('/dashboard'); // We'll build a service list page later

    } catch (err: any) {
      setError(err.message);
      setIsLoading(false);
    }
  };

  return (
    <div style={{ padding: '2rem', maxWidth: '600px', margin: 'auto' }}>
      <h1>Create a New Service</h1>
      <p>Fill out the details for your new service listing.</p>
      <form onSubmit={handleSubmit} style={{ marginTop: '1.5rem' }}>
        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="title">Service Title</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="category">Category</label>
          <select
            id="category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc' }}
          >
            {categories.map((cat) => (
              <option key={cat} value={cat}>
                {cat.charAt(0).toUpperCase() + cat.slice(1)}
              </option>
            ))}
          </select>
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="price">Price (in NZD)</label>
          <input
            id="price"
            type="number"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            required
            placeholder="e.g., 150.00"
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc' }}
          />
        </div>

        <div style={{ marginBottom: '1rem' }}>
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={5}
            style={{ width: '100%', padding: '8px', border: '1px solid #ccc' }}
          />
        </div>

        {error && <p style={{ color: 'red' }}>Error: {error}</p>}
        <button type="submit" disabled={isLoading} style={{ padding: '10px 15px' }}>
          {isLoading ? 'Creating...' : 'Create Service'}
        </button>
      </form>
    </div>
  );
}

