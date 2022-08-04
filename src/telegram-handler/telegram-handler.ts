import { marshall } from '@aws-sdk/util-dynamodb';
import { EventBridge } from '@aws-sdk/client-eventbridge';
import { Markup, Telegraf, Scenes, Composer, session } from 'telegraf';
import { DynamoDB, PutItemCommandInput } from '@aws-sdk/client-dynamodb';

import translation from './translation.json';

const AWS_REGION = process.env.AWS_REGION || '';
const TOKEN = process.env.BOT_TOKEN || '';
const TABLE_NAME = process.env.TABLE_NAME || '';
const UA = {
  flag: '🇺🇦',
  abbr: 'ua',
};
const RU = {
  flag: '🇷🇺',
  abbr: 'ru',
};
const DEFAULT_SCENE_ID = 'default_scene_id';
const client = new DynamoDB({ region: process.env.AWS_REGION || '' });

const bot = new Telegraf(TOKEN, {
  telegram: {
    webhookReply: false,
  },
});

const languageHandler = new Composer<Scenes.WizardContext>();
languageHandler.action([UA.abbr, RU.abbr], async (ctx) => {
  const { data } = ctx.update.callback_query;

  (ctx.wizard.state as any).contactData = {
    lang: data,
    accountId: ctx.update.callback_query.from.id,
  };
  // @ts-ignore
  const { welcome, start } = translation[data];
  await ctx.reply(
    welcome,
    Markup.inlineKeyboard([Markup.button.callback(start, 'start')]),
  );
  return ctx.wizard.next();
});

languageHandler.use((ctx) =>
  ctx.replyWithMarkdown(
    'Будь ласка зробіть вибір / Пожалуйста сделайте выбор',
    Markup.inlineKeyboard([
      Markup.button.callback(UA.flag, UA.abbr),
      Markup.button.callback(RU.flag, RU.abbr),
    ]),
  ),
);
const registerHandler = new Composer<Scenes.WizardContext>();
registerHandler.action('start', async (ctx) => {
  const { lang } = (ctx.wizard.state as any).contactData;
  // @ts-ignore
  const { getAccountNumber } = translation[lang];
  await ctx.reply(getAccountNumber);
  return ctx.wizard.next();
});
registerHandler.use((ctx) => {
  const { lang } = (ctx.wizard.state as any).contactData;
  // @ts-ignore
  const { use, start } = translation[lang];
  ctx.replyWithMarkdown(
    use,
    Markup.inlineKeyboard([Markup.button.callback(start, 'start')]),
  );
});

const superWizard = new Scenes.WizardScene(
  DEFAULT_SCENE_ID,
  async (ctx: any) => {
    await ctx.reply(
      `Мова ${UA.flag} / Язык ${RU.flag}`,
      Markup.inlineKeyboard([
        Markup.button.callback(UA.flag, UA.abbr),
        Markup.button.callback(RU.flag, RU.abbr),
      ]),
    );
    return ctx.wizard.next();
  },
  languageHandler,
  registerHandler,
  async (ctx: any) => {
    const { lang } = ctx.wizard.state.contactData as any;
    const accountNumber = Number(ctx.message.text);
    // @ts-ignore
    const { getAccountNumber, getSecureCode } = translation[lang];

    if (
      ctx.message.text.length < 10 ||
      (ctx.message.text.length >= 10 && !Number.isInteger(accountNumber))
    ) {
      ctx.reply(getAccountNumber);
      return;
    }
    ctx.wizard.state.contactData.accountNumber = ctx.message.text;
    ctx.reply(getSecureCode);
    return ctx.wizard.next();
  },
  async (ctx: any) => {
    const { lang } = ctx.wizard.state.contactData;
    // @ts-ignore
    const { getSecureCode, success, coffee } = translation[lang];

    if (
      ctx.message.text.length < 4 ||
      (ctx.message.text.length >= 4 &&
        !Number.isInteger(Number(ctx.message.text)))
    ) {
      ctx.reply(getSecureCode);
      return;
    }
    ctx.wizard.state.contactData.secureCode = ctx.message.text;
    ctx.wizard.state.contactData.balance = 0;

    const params: PutItemCommandInput = {
      TableName: TABLE_NAME,
      Item: marshall(ctx.wizard.state.contactData),
    };
    console.info('Before put item. Item:', params.Item);
    await client.putItem(params);

    await ctx.reply(
      success,
      Markup.inlineKeyboard([
        Markup.button.url(coffee, 'https://send.monobank.ua/41RXGqfXuD'),
        Markup.button.callback('Баланс 💰', 'balance'),
      ]),
    );
    return ctx.scene.leave();
  },
);

const stage = new Scenes.Stage<Scenes.WizardContext>([superWizard]);
bot.use(session());
bot.use(stage.middleware() as any);
bot.start((ctx: any) => ctx.scene.enter(DEFAULT_SCENE_ID));
bot.action('balance', async (ctx) => {
  try {
    console.log('balance handler', ctx);
    const accountId = ctx.update.callback_query.from.id || '';
    const client = new EventBridge({ region: AWS_REGION });
    const output = await client.putEvents({
      Entries: [
        {
          Source: 'telegram-handler',
          DetailType: 'check-balance',
          Detail: JSON.stringify({ accountId }),
        },
      ],
    });
    console.log('event output', output);
  } catch (e) {
    console.log('ERROR:', e);
  }

  await ctx.reply(
    'Ваш баланс xxx',
    Markup.keyboard([Markup.button.text('Баланс 💰')]).resize(),
  );
});

bot.hears('Баланс 💰', async (ctx) => {
  try {
    console.log('balance handler', ctx);
    const accountId = ctx.update.message.from.id || '';
    const client = new EventBridge({ region: AWS_REGION });
    const output = await client.putEvents({
      Entries: [
        {
          Source: 'telegram-handler',
          DetailType: 'check-balance',
          Detail: JSON.stringify({ accountId }),
        },
      ],
    });
    console.log('event output', output);
  } catch (e) {
    console.log('ERROR:', e);
  }
});

export const handler = async (event: any = {}): Promise<any> => {
  const body: any = JSON.parse(event.body);
  console.info('Body: ', body);
  await bot.handleUpdate(body);
  return { statusCode: 204, body: JSON.stringify('so far so good') };
};
