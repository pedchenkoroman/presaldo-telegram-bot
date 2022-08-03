import { Telegraf } from 'telegraf';
import { DynamoDBStreamHandler } from 'aws-lambda';
const { unmarshall } = require('@aws-sdk/util-dynamodb');

const TOKEN = process.env.BOT_TOKEN || '';

export const handler: DynamoDBStreamHandler = async ({
  Records,
}): Promise<any> => {
  const [record] = Records;
  const { dynamodb } = record;
  const data = unmarshall(dynamodb?.NewImage);
  if (!data.accountId) {
    console.log('Telegram Account id does not exist', data);
    return {
      statusCode: 400,
      body: JSON.stringify('Account id does not exist'),
    };
  }
  const bot = new Telegraf(TOKEN);

  try {
    await bot.telegram.sendMessage(
      data.accountId,
      `Balance was changed and right now equals **${data.balance}** euro`,
    );
    await bot.launch();
  } catch (e) {
    console.log('error', JSON.stringify(e));
    return {
      statusCode: 500,
      body: JSON.stringify('Something went wrong'),
    };
  }
};
