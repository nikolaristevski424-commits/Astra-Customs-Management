// Old public panels may still contain ticket menu/button components.
// Accept ticket-opening interactions ONLY from a bot-authored dedicated
// Tickets/Assistance panel, never from Order Status, Order Here, Portfolio,
// or an outdated dashboard. This preserves existing legitimate ticket panels.
function isTicketPanel(message,botUserId){
    if(!message)return false;
    if(botUserId && message.author?.id!==botUserId)return false;
    const components=(message.components||[]).map(c=>typeof c?.toJSON==='function'?c.toJSON():c);
    const embeds=(message.embeds||[]).map(e=>typeof e?.toJSON==='function'?e.toJSON():e);
    const text=[String(message.content||''),JSON.stringify(components),JSON.stringify(embeds)].join(' ');
    // Explicitly deny old non-ticket panels, including ones with mixed controls.
    if(/Order Status|Order Here|Portfolio|Place an Order|astra_order_type|order_open/i.test(text))
        return false;
    const hasTicketControl=/astra_ticket_type|help_ticket_open|management_ticket_open|report_ticket_open/.test(text);
    const isDedicated=/Astra Customs Assistance|Ticket Center|Ticket Support|Support Center|Select a ticket type below|Open a private ticket/i.test(text);
    return hasTicketControl && isDedicated;
}
module.exports={isTicketPanel};
