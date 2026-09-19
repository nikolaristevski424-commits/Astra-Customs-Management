/** Robux received after Roblox's marketplace fee, given a sale price. */
function receiveForPay(price) {
    return price - Math.floor(price * 0.3);
}

/** Smallest sale price that nets at least `amount` Robux after tax. */
function payForReceive(amount) {
    let price = Math.floor(amount / 0.7);
    while (receiveForPay(price) < amount) price++;
    return price;
}

module.exports = { receiveForPay, payForReceive };
