import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { createManualShoe } from '@/lib/actions/shoes';

/**
 * Add a shoe manually — for off-Strava entries. The form auto-matches
 * the brand+model against the CSV when possible, falling back to the
 * user's typed values.
 */
export function AddManualShoeForm() {
  return (
    <form action={createManualShoe} className="space-y-4">
      <div className="grid md:grid-cols-2 gap-4">
        <div>
          <label htmlFor="shoe-name" className="nn-caps block mb-2">
            shoe name *
          </label>
          <Input
            id="shoe-name"
            name="name"
            required
            placeholder="e.g. Saucony Endorphin Pro 3 (yellow)"
          />
        </div>
        <div>
          <label htmlFor="shoe-target" className="nn-caps block mb-2">
            your target km
          </label>
          <Input
            id="shoe-target"
            name="userTargetKm"
            type="number"
            min="50"
            max="5000"
            placeholder="leave blank to use CSV default"
          />
        </div>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <div>
          <label htmlFor="shoe-brand" className="nn-caps block mb-2">
            brand
          </label>
          <Input
            id="shoe-brand"
            name="brand"
            placeholder="e.g. Saucony"
          />
        </div>
        <div>
          <label htmlFor="shoe-model" className="nn-caps block mb-2">
            model
          </label>
          <Input
            id="shoe-model"
            name="model"
            placeholder="e.g. Endorphin Pro 3"
          />
        </div>
        <div>
          <label htmlFor="shoe-purchase" className="nn-caps block mb-2">
            purchase date
          </label>
          <Input
            id="shoe-purchase"
            name="purchaseDate"
            type="date"
          />
        </div>
      </div>

      <div>
        <label htmlFor="shoe-notes" className="nn-caps block mb-2">
          notes
        </label>
        <textarea
          id="shoe-notes"
          name="notes"
          rows={2}
          className="w-full bg-ink border border-ink-line px-3 py-2 text-sm text-bone font-mono focus-visible:outline-none focus-visible:border-accent"
          placeholder="any tags, e.g. 'race-day only', 'rotation pair', 'recovery walks'"
        />
      </div>

      <Button variant="primary" size="md" type="submit">
        Add shoe
      </Button>
      <p className="font-mono text-xs text-bone-mute leading-relaxed">
        ↳ if brand + model match the bundled shoe database, recommended km is auto-filled
      </p>
    </form>
  );
}
