// Every Shippo request names the API version it was written for, so a change to the Shippo account's
// default version can never change the shape of rates, labels, tracking or address checks under us.
// The code reads the 2018-02-08 shapes (servicelevel.name, transaction.status, tracking_status.substatus).
const SHIPPO_API_VERSION = "2018-02-08";

/** Request headers for one Shippo API call. */
function shippoHeaders(token) {
  return {
    "Authorization": `ShippoToken ${token}`,
    "Content-Type": "application/json",
    "Shippo-API-Version": SHIPPO_API_VERSION,
  };
}

module.exports = { SHIPPO_API_VERSION, shippoHeaders };
