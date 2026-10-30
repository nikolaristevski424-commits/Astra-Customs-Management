const test=require('node:test');
const assert=require('node:assert/strict');
const tickets=require('../utils/tickets');
const loa=require('../commands/loa');
const GUILD='ticket-allowance-'+Date.now();
const USER='1255248600850497568';
const OTHER='1453383083913904234';

test('orders never reduce the three-open-help-ticket allowance',()=>{
  assert.equal(tickets.MAX_OPEN_TICKETS,3);
  const order=tickets.create(GUILD,'2000000000000000001',{userId:USER,type:'order'});
  assert.equal(order.type,'order');
  assert.equal(tickets.ticketLimit(GUILD,USER).count,0);
  assert.equal(tickets.ticketLimit(GUILD,USER).remaining,3);
  assert.equal(tickets.findOpenForUser(GUILD,USER,'order').type,'order');
});
test('support, management and reports share three tickets and block a fourth atomically',()=>{
  for(const [index,type] of ['support','management','report'].entries()){
    assert.ok(tickets.createLimited(GUILD,String(3000000000000000001n+BigInt(index)),{userId:USER,type}));
  }
  assert.equal(tickets.ticketLimit(GUILD,USER).count,3);
  assert.equal(tickets.ticketLimit(GUILD,USER).remaining,0);
  assert.equal(tickets.ticketLimit(GUILD,USER).allowed,false);
  assert.equal(tickets.createLimited(GUILD,'3000000000000000010',{userId:USER,type:'support'}),null);
  assert.equal(tickets.list(GUILD).filter(x=>x.userId===USER).length,4); // one order, three tickets
  assert.equal(tickets.ticketLimit(GUILD,OTHER).allowed,true);
  assert.ok(tickets.createLimited(GUILD,'3000000000000000011',{userId:OTHER,type:'report'}));
});
test('closing a ticket reopens a slot; closing an order has no impact on tickets',()=>{
  tickets.update(GUILD,'2000000000000000001',{closedAt:Date.now()});
  assert.equal(tickets.ticketLimit(GUILD,USER).count,3);
  tickets.update(GUILD,'3000000000000000001',{closedAt:Date.now()});
  assert.equal(tickets.ticketLimit(GUILD,USER).count,2);
  assert.ok(tickets.createLimited(GUILD,'3000000000000000012',{userId:USER,type:'management'}));
  assert.equal(tickets.ticketLimit(GUILD,USER).count,3);
});
test('the four specified roles independently authorize LOA requests',()=>{
  const expected=['1497420088456777859','1565198911662985336','1565689738906574940','1497415634915561603'];
  assert.deepEqual(loa.LOA_REQUEST_ROLE_IDS,expected);
  const cfg={staffRoleIds:[]};
  for(const roleId of expected){
    const member={permissions:{has:()=>false},roles:{cache:new Map([[roleId,{id:roleId}]])}};
    assert.equal(loa.canRequestLOA(member,cfg),true,'Role '+roleId+' must be permitted');
  }
  const unrelated={permissions:{has:()=>false},roles:{cache:new Map([['1000000000000000000',{id:'1000000000000000000'}]])}};
  assert.equal(loa.canRequestLOA(unrelated,cfg),false);
});
