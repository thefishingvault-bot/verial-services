import React from "react";

export default function AdminBookingsFiltersBar() {
  // TODO: Implement search/filter UI for bookings
  return (
    <div className="mb-4 flex gap-2">
      {/* Booking ID */}
      <input className="border px-2 py-1" placeholder="Booking ID" name="bookingId" />
      {/* User ID */}
      <input className="border px-2 py-1" placeholder="User ID" name="userId" />
      {/* Provider ID */}
      <input className="border px-2 py-1" placeholder="Provider ID" name="providerId" />
      {/* Status */}
      <select className="border px-2 py-1" name="status">
        <option value="">All Statuses</option>
        <option value="pending">Pending</option>
        <option value="confirmed">Confirmed</option>
        <option value="completed">Completed</option>
        <option value="cancelled">Cancelled</option>
      </select>
      {/* Date */}
      <input className="border px-2 py-1" type="date" name="date" />
      {/* Search button (to be wired up) */}
      <button className="border px-4 py-1 bg-blue-500 text-white">Search</button>
    </div>
  );
}
