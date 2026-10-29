// Discord modals allow five inputs and labels at most 45 characters.
const QUESTIONS=Object.freeze({
  moderator:[
    {id:'bypass',label:'Someone bypasses chat rules. Your response?',question:'Someone bypassed in the general channel. What is your reaction?',max:1000},
    {id:'disrespect',label:'Someone disrespects members or staff?',question:'Someone is disrespecting other people or staff. What would you do?',max:1000},
    {id:'staff_spam',label:'Another staff member floods/spams chat?',question:'Another Discord staff member is flooding or spamming chat. What is your reaction?',max:1000},
    {id:'staff_bias',label:'Staff ignores a rule bypass. What next?',question:'Another Discord staff member is biased and is not moderating someone who bypassed the rules in general chat. What is your reaction?',max:1000},
    {id:'why_moderator',label:'Why should you be a moderator? (2+ lines)',question:'Why do you think you should be a Discord Moderator at Astra Customs? (2+ sentences)',max:1000},
  ],
  partnership:[
    {id:'partner_role',label:'What does the Partnership Team do?',question:'What should the Astra Customs Partnership Manager Team do? (2+ sentences)',max:1000},
    {id:'partner_growth',label:'How would you grow Astra Customs?',question:'How are you going to improve Astra Customs activity and get more members? (2+ sentences)',max:1000},
    {id:'partner_ideas',label:'Give 3 specific growth suggestions',question:'Tell us 3 suggestions for improving Astra Customs activity, what you would do for Astra Customs, or how you would get more members for Astra Customs.',max:1000},
  ],
  staff:[
    {id:'why_join',label:'Why should we choose you?',question:'Why should we choose you for Customer Support?',max:1000},
    {id:'activity',label:'Activity level from 1 to 10',question:'How active can you be from 1-10?',max:10,short:true},
    {id:'experience',label:'Your experience',question:'What experience do you have?',max:1000},
    {id:'difficult_customer',label:'How would you handle a difficult client?',question:'How would you handle a difficult customer?',max:1000},
    {id:'roblox_username',label:'Roblox username',question:'Roblox Username',max:50,short:true},
  ],
  designer:[
    {id:'why_join',label:'Why join the Creative Team?',question:'Why do you want to join as a designer?',max:1000},
    {id:'portfolio',label:'Your portfolio link(s)',question:'Portfolio link(s)',max:500,short:true},
    {id:'software',label:'Which design software do you use?',question:'What software do you use?',max:300,short:true},
    {id:'specialties',label:'Your design specialties',question:'What do you specialize in?',max:700},
    {id:'roblox_username',label:'Roblox username',question:'Roblox Username',max:50,short:true},
  ],
});
function questionsFor(type){return QUESTIONS[type]||null;}
module.exports={QUESTIONS,questionsFor};
