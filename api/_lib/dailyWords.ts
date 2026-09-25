/**
 * The Telegram bot's daily word (api/_lib/studentBot.ts): words and phrases
 * that raise an IELTS Writing band, with the Uzbek meaning and an example in
 * the kind of sentence a Task 1 or Task 2 answer needs. Each student moves
 * through the list in order, so nobody gets a repeat until they have had
 * every word.
 */
export interface DailyWord {
  word: string;
  uzbek: string;
  example: string;
}

export const DAILY_WORDS: DailyWord[] = [
  { word: 'significant', uzbek: "sezilarli, muhim", example: 'There was a significant rise in car ownership between 2000 and 2020.' },
  { word: 'decline', uzbek: "kamaymoq, pasaymoq", example: 'The number of visitors declined sharply after 2015.' },
  { word: 'fluctuate', uzbek: "o'zgarib turmoq", example: 'Oil prices fluctuated throughout the year.' },
  { word: 'approximately', uzbek: 'taxminan', example: 'Approximately a third of students live on campus.' },
  { word: 'account for', uzbek: "(ulushini) tashkil qilmoq", example: 'Cars account for 60% of all journeys to work.' },
  { word: 'consequently', uzbek: 'natijada, shuning uchun', example: 'Rents rose quickly; consequently, many families moved to the suburbs.' },
  { word: 'alleviate', uzbek: 'yengillashtirmoq', example: 'Better public transport can alleviate traffic congestion.' },
  { word: 'detrimental', uzbek: 'zararli', example: "Too much screen time is detrimental to children's sleep." },
  { word: 'beneficial', uzbek: 'foydali', example: 'Regular exercise is beneficial for mental health.' },
  { word: 'inevitable', uzbek: 'muqarrar', example: 'Some job losses are inevitable as technology develops.' },
  { word: 'undermine', uzbek: "putur yetkazmoq", example: 'Cheating undermines trust in exam results.' },
  { word: 'prioritise', uzbek: "birinchi o'ringa qo'ymoq", example: 'Governments should prioritise public health over road building.' },
  { word: 'sustainable', uzbek: 'barqaror', example: 'Cities need sustainable ways to produce energy.' },
  { word: 'deteriorate', uzbek: 'yomonlashmoq', example: 'Air quality has deteriorated in many large cities.' },
  { word: 'enhance', uzbek: 'yaxshilamoq, oshirmoq', example: "Reading widely can enhance a student's vocabulary." },
  { word: 'widespread', uzbek: 'keng tarqalgan', example: 'Mobile banking is now widespread in Uzbekistan.' },
  { word: 'contribute to', uzbek: "sabab bo'lmoq, hissa qo'shmoq", example: 'Fast food contributes to rising obesity.' },
  { word: 'a growing number of', uzbek: "tobora ko'payib borayotgan", example: 'A growing number of students study online.' },
  { word: 'stem from', uzbek: 'kelib chiqmoq', example: 'Many health problems stem from a poor diet.' },
  { word: 'essential', uzbek: 'zarur, juda muhim', example: 'Clean water is essential for every community.' },
  { word: 'peak', uzbek: "eng yuqori nuqtaga yetmoq", example: 'Sales peaked in December at 5,000 units.' },
  { word: 'level off', uzbek: 'barqarorlashmoq', example: 'Unemployment levelled off after 2018.' },
  { word: 'surge', uzbek: "keskin o'sish", example: 'There was a surge in online shopping in 2020.' },
  { word: 'marginal', uzbek: 'juda kichik, sezilmas', example: 'There was only a marginal increase in bus fares.' },
  { word: 'the overwhelming majority', uzbek: "mutlaq ko'pchilik", example: 'The overwhelming majority of teenagers own a smartphone.' },
  { word: 'place a burden on', uzbek: "og'irlik solmoq", example: 'An ageing population places a burden on hospitals.' },
  { word: 'tackle', uzbek: 'hal qilishga kirishmoq', example: 'Governments must tackle unemployment among young people.' },
  { word: 'affordable', uzbek: 'hamyonbop', example: 'Housing should be affordable for young families.' },
  { word: 'reluctant', uzbek: 'istamaydigan, ikkilanadigan', example: 'Many people are reluctant to change their eating habits.' },
  { word: 'compulsory', uzbek: 'majburiy', example: 'Some people think voluntary work should be compulsory for students.' },
  { word: 'hinder', uzbek: "to'sqinlik qilmoq", example: 'Slow internet access hinders online learning in villages.' },
  { word: 'in the long run', uzbek: 'uzoq muddatda', example: 'In the long run, a good education pays for itself.' },
  { word: 'drawback', uzbek: 'kamchilik', example: 'The main drawback of city life is the noise.' },
  { word: 'advocate', uzbek: 'yoqlab chiqmoq', example: 'Some doctors advocate a shorter working week.' },
  { word: 'pursue', uzbek: 'intilmoq, davom ettirmoq', example: 'More women now pursue careers in science.' },
  { word: 'vulnerable', uzbek: 'himoyasiz, zaif', example: 'Elderly people are especially vulnerable in hot weather.' },
  { word: 'adverse', uzbek: 'salbiy', example: 'The new tax had adverse effects on small businesses.' },
  { word: 'mitigate', uzbek: 'kamaytirmoq, yumshatmoq', example: 'Planting trees can mitigate the heat in cities.' },
  { word: 'commute', uzbek: 'ishga qatnamoq', example: 'Many workers commute for more than an hour a day.' },
  { word: 'urbanisation', uzbek: 'shaharlashuv', example: 'Rapid urbanisation puts pressure on housing.' },
  { word: 'an ageing population', uzbek: 'qariyotgan aholi', example: 'Japan has an ageing population and a shrinking workforce.' },
  { word: 'proportion', uzbek: 'ulush, nisbat', example: 'The proportion of people over 65 increased steadily.' },
  { word: 'respectively', uzbek: 'mos ravishda', example: 'Sales reached 20% and 35% in 2000 and 2010 respectively.' },
  { word: 'whereas', uzbek: 'holbuki, ... esa', example: 'Men spent more on cars, whereas women spent more on clothes.' },
  { word: 'subsequently', uzbek: 'keyinchalik', example: 'Prices rose in 2008 and subsequently fell.' },
  { word: 'remain stable', uzbek: "o'zgarmay qolmoq", example: 'Coffee sales remained stable at around 200 tonnes.' },
  { word: 'to a large extent', uzbek: 'katta darajada', example: 'I agree with this view to a large extent.' },
  { word: 'raise awareness of', uzbek: 'xabardorlikni oshirmoq', example: 'Campaigns can raise awareness of healthy eating.' },
  { word: 'take into account', uzbek: "hisobga olmoq", example: 'Planners must take into account the needs of older people.' },
  { word: 'outweigh', uzbek: "ustun bo'lmoq", example: 'In my view, the benefits of tourism outweigh its drawbacks.' },
];
