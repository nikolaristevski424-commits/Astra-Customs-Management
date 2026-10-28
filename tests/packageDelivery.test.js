const test=require('node:test');
const assert=require('node:assert/strict');
const delivery=require('../utils/packageDelivery');
const packages=require('../utils/packages');
const command=require('../commands/package');

test('package request supports text, links, or optional file',()=>{
  const data=command.data.toJSON();
  const options=data.options.find(x=>x.name==='request').options;
  assert.deepEqual(options.map(x=>x.name),['package_id','text','links','file']);
  assert.equal(options.find(x=>x.name==='text').required,false);
  assert.ok(data.options.find(x=>x.name==='create').options.some(x=>x.name==='text'));
});
test('a package may be deliverable without attachments',()=>{
  const pkg={name:'Roblox Design Codes',files:[],deliveryText:'CODE-123\nCODE-456',deliveryLinks:[]};
  assert.equal(delivery.hasDelivery(pkg),true);
  assert.match(delivery.summary(pkg),/text\/code/);
  const messages=delivery.deliveryMessages(pkg);
  assert.ok(messages.some(x=>x.content.includes('CODE-123')));
  assert.ok(messages.every(x=>x.allowedMentions?.parse.length===0));
  assert.equal(delivery.hasDelivery({files:[],deliveryText:'',deliveryLinks:[]}),false);
});
test('link-only package includes private HTTPS delivery URLs in DM, not public preview',()=>{
  const pkg={name:'Download Pack',description:'Ten uniforms',price:140,status:'approved',createdBy:'123456789012345678',
    files:[],deliveryLinks:['https://example.com/download/abc'],deliveryText:''};
  assert.equal(delivery.hasDelivery(pkg),true);
  const messages=delivery.deliveryMessages(pkg);
  assert.ok(messages.some(x=>x.content.includes('https://example.com/download/abc')));
  const panel=command.buildPackageContainer({},pkg).toJSON();
  const publicText=JSON.stringify(panel);
  assert.ok(!publicText.includes('example.com/download/abc'));
  assert.ok(publicText.includes('1 private link(s)'));
  const privatePanel=command.buildPackageContainer({},pkg,{includePrivate:true}).toJSON();
  assert.ok(JSON.stringify(privatePanel).includes('example.com/download/abc'));
});
test('delivery links reject invalid protocols or invalid HTTP hosts',()=>{
  assert.deepEqual(delivery.parseLinks('https://example.com/a https://example.org/b'),['https://example.com/a','https://example.org/b']);
  for(const value of ['javascript:alert(1)','http://example.com/file','https://user:pw@example.com','not-a-link']){
    assert.throws(()=>delivery.parseLinks(value));
  }
});
test('package delivery changes persist in storage',()=>{
  const gid='pkg-test-'+Date.now();
  const pkg=packages.create(gid,{name:'Code Pack',price:50,createdBy:'test',files:[]});
  const updated=packages.updateDelivery(gid,pkg.id,{deliveryText:'ABCD',deliveryLinks:['https://example.com/a'],files:[]});
  assert.equal(updated.deliveryText,'ABCD');
  assert.equal(packages.find(gid,pkg.id).deliveryLinks[0],'https://example.com/a');
});

test('long delivery text is fully visible to staff in separate bounded components',()=>{
 const text='X'.repeat(4000);
 const pkg={name:'Large Text',price:100,status:'approved',createdBy:'123456789012345678',
   description:'Summary',files:[],deliveryText:text,deliveryLinks:[]};
 const components=command.buildPackageContainer({},pkg,{includePrivate:true}).toJSON().components;
 const contents=components.filter(x=>x.type===10).map(x=>x.content);
 assert.ok(contents.every(x=>x.length<=3400));
 assert.ok(contents.join('').includes(text));
 assert.ok(!JSON.stringify(command.buildPackageContainer({},pkg).toJSON()).includes(text));
});
