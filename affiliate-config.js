// Public affiliate identifiers and URL templates only.
// Never place API secrets, private keys, or passwords in this file.
//
// After a provider approves the account, paste the exact deep-link template supplied
// by its partner dashboard. Supported placeholders:
//   {destination}  city/overnight stop
//   {query}        hotel style plus destination
//   {subId}        privacy-safe Travel AI attribution token
window.TRAVEL_AFFILIATE_CONFIG = Object.freeze({
  providers: [
    {
      id: "tripadvisor",
      label: "Tripadvisor",
      revenueModel: "qualified_click",
      urlTemplate: ""
    },
    {
      id: "booking",
      label: "Booking.com",
      revenueModel: "completed_booking",
      urlTemplate: ""
    },
    {
      id: "expedia",
      label: "Expedia",
      revenueModel: "completed_booking",
      urlTemplate: ""
    },
    {
      id: "travelpayouts",
      label: "Travelpayouts",
      revenueModel: "completed_booking",
      urlTemplate: ""
    }
  ]
});
