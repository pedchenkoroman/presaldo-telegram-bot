import { Telegraf } from 'telegraf';

const TOKEN = process.env.BOT_TOKEN || '';

export const handler = async (event: any = {}): Promise<any> => {
  const {
    Records: [record],
  } = event;
  if (record.dynamodb?.NewImage?.accountId?.N) {
    console.log('Account id does not exist', record.dynamodb);
    return {
      statusCode: 500,
      body: JSON.stringify('Account id does not exist'),
    };
  }
  const bot = new Telegraf(TOKEN);
  await bot.telegram.sendMessage(
    record.dynamodb.NewImage.accountId.N,
    `Balance was changed and right now equals **${record.dynamodb.NewImage?.balance?.N}** euro`,
  );
  await bot.launch();
};
