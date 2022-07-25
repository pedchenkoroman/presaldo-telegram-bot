import * as AWS from 'aws-sdk';
const chromium = require('@sparticuz/chrome-aws-lambda');
import { fromPairs, curry, compose, propOr, head } from 'ramda';

const TABLE_NAME = process.env.TABLE_NAME || '';
const PRIMARY_KEY = process.env.PRIMARY_KEY || '';

const db = new AWS.DynamoDB.DocumentClient();

type User = {
  secureCode: string;
  accountId: string;
  accountNumber: string;
  balance: number;
};

export const handler = async (): Promise<any> => {
  try {
    const user = (await db
      .scan({
        TableName: TABLE_NAME,
      })
      .promise()
      .then(compose(head, propOr([], 'Items')))) as User | undefined;

    if (!user) {
      return { statusCode: 500, body: JSON.stringify('User is empty') };
    }

    const browser = await chromium.puppeteer.launch({
      args: chromium.args,
      defaultViewport: {
        width: 1024,
        height: 800,
      },
      executablePath: await chromium.executablePath,
      headless: chromium.headless,
      ignoreHTTPSErrors: true,
    });
    const page = await browser.newPage();
    await page.goto('https://www.prepaidsaldo.com');

    const fillField = async ([selector, value]: string[]): Promise<void> => {
      const field = await page.$(selector);
      return field.type(value);
    };
    for (const item of [
      ['#mainform\\:cardnumber', user.accountNumber],
      ['#mainform\\:password', user.secureCode],
    ]) {
      await fillField(item);
    }

    const nextBtn = await page.$('a.last');
    await nextBtn.click();
    await page.waitForSelector('#scrollable-content');

    const table = await page.$('table.data');

    const takeSecond = ([, second]: any) => second;
    const slice = curry((beginIndex, str) => str.slice(beginIndex));

    const currentBalance = await table
      .$$eval('tr', (node: Array<any>) =>
        node.map((n) => n.innerText).map((text) => text.split('\t')),
      )
      .then(compose(Number, slice(2), takeSecond, Object.values, fromPairs));
    await browser.close();

    const { balance, accountId, ...rest } = user;
    if (balance === currentBalance) {
      return { statusCode: 204, body: 'Nothing changes' };
    }
    const params: any = {
      TableName: TABLE_NAME,
      Key: {
        [PRIMARY_KEY]: accountId,
      },
      UpdateExpression: 'set balance = :balance',
      ExpressionAttributeValues: {},
      ReturnValues: 'UPDATED_NEW',
    };
    params.ExpressionAttributeValues[`:balance`] = currentBalance;

    ['secureCode', 'accountNumber'].forEach((property) => {
      params.UpdateExpression += `, ${property} = :${property}`;
      // @ts-ignore
      params.ExpressionAttributeValues[`:${property}`] = rest[property];
    });

    await db.update(params).promise();
    return { statusCode: 204, body: 'The balance was updated' };
  } catch (error) {
    return { statusCode: 500, body: JSON.stringify('Something went wrong') };
  }
};
