// 108 multi-turn conversations: twelve distinct conversational situations,
// three configured activity contracts, three languages. No single-turn or
// punctuation copies count toward this suite. Expectations are business facts.
export const conversations=[];
const languages={
 ar:{menu:'شو خدماتكم',book:'أبا',tomorrow:'بكره',clock:'الساعة 18:00',ambiguous:'5',period:'العصر',correctTime:'لا قصدي 6',price:'كم سعر',switch:'غيرها',back:'لا قصدي',vehicle:'ستيشن',unknown:'اللي قلت لك عنه',same:'نفس المكان',thanks:'شكرا',greeting:'هلا',negate:'لا تحجز'},
 en:{menu:'what services do you offer',book:'book',tomorrow:'tomorrow',clock:'at 18:00',ambiguous:'5',period:'afternoon',correctTime:'actually 6',price:'price',switch:'change it to',back:'actually',vehicle:'SUV',unknown:'the thing I told you about',same:'same place',thanks:'thanks',greeting:'hello',negate:'do not book'},
 mixed:{menu:'شو services عندكم',book:'أبي',tomorrow:'tomorrow',clock:'at 18:00',ambiguous:'5',period:'afternoon',correctTime:'لا قصدي 6',price:'كم سعر',switch:'غيرها',back:'actually',vehicle:'SUV',unknown:'the thing اللي قلت لك',same:'same place',thanks:'شكرا',greeting:'hello',negate:'do not book'},
};
const catalog={car_wash:['خارجي','Exterior','VIP'],salon:['قص شعر','Haircut','Styling'],services:['استشارة','Consultation','Premium']};
for(const [type,labels] of Object.entries(catalog))for(const [language,l] of Object.entries(languages)){
 const service=language==='ar'?labels[0]:labels[1],other=labels[2],start=`${l.book} ${service}`;
 const cases=[
  ['pending_answer',[l.menu,start,type==='car_wash'?l.vehicle:l.tomorrow],{goal:'BOOK_SERVICE',service:0,field:type==='car_wash'?'location':'time'}],
  ['time_first',[`${l.book} ${service} ${l.tomorrow}`,l.ambiguous,l.period],{goal:'BOOK_SERVICE',service:0,time:'17:00'}],
  ['time_correction',[`${start} ${l.tomorrow}`,`${l.ambiguous} PM`,l.correctTime],{goal:'BOOK_SERVICE',service:0,time:'18:00'}],
  ['side_price',[start,`${l.price} ${other}`,type==='car_wash'?l.vehicle:l.tomorrow],{goal:'BOOK_SERVICE',service:0,field:type==='car_wash'?'location':'time'}],
  ['service_change',[start,`${l.switch} ${other}`,`${l.back} ${service}`],{goal:'BOOK_SERVICE',service:0}],
  ['unknown_reference',[start,l.unknown,type==='car_wash'?l.vehicle:l.tomorrow],{goal:'BOOK_SERVICE',service:0}],
  ['unverified_location',[start,l.same,type==='car_wash'?l.vehicle:l.tomorrow],{goal:'BOOK_SERVICE',service:0,noLocation:true}],
  ['greeting_continuation',[start,l.greeting,type==='car_wash'?l.vehicle:l.tomorrow],{goal:'BOOK_SERVICE',service:0}],
  ['price_then_book',[`${l.price} ${service}`,start,type==='car_wash'?l.vehicle:l.tomorrow],{goal:'BOOK_SERVICE',service:0}],
  ['facts_out_of_order',[`${start} ${l.clock}`,l.tomorrow,type==='car_wash'?l.vehicle:l.correctTime],{goal:'BOOK_SERVICE',service:0,date:'2026-09-10',time:'18:00'}],
  ['explicit_booking_stop',[start,type==='car_wash'?l.vehicle:l.tomorrow,l.negate],{goal:'UNKNOWN',noMutation:true}],
  ['side_price_after_fact',[start,type==='car_wash'?l.vehicle:l.tomorrow,`${l.price} ${other}`],{goal:'BOOK_SERVICE',service:0,sidePrice:true}],
 ];
 for(const [scenario,turns,expected] of cases)conversations.push({id:`${type}/${language}/${scenario}`,type,language,scenario,labels,turns,expected});
}
