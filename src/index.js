const { createLogger, format, transports } = require("winston");
const { combine, timestamp, printf } = format;
const logger = createLogger({
  format: combine(
    timestamp(),
    printf(
      ({ level, message, timestamp }) => `${timestamp} [${level}]: ${message}`
    )
  ),
  transports: [new transports.Console()],
});

require("dotenv").config();
const sdk = require("api")("@opensea/v2.0#1nqh2zlnvr1o4h");

const OPENSEA_KEY = process.env.API_OPENSEA;

sdk.auth(OPENSEA_KEY);
sdk.server("https://api.opensea.io");

const THE_ODYSSEY = "The Odyssey";
const ARBITRUM_ODYSSEY_NFT = "arbitrum-odyssey-nft";
const ETH_SYMBOL = "ETH";
const TIME_INTERVAL_LIST = 300;
const TIME_INTERVAL_SALE = 30000;
const LISTING_TYPE = "order";
const SALE_TYPE = "sale";
const COUNT_FOR_FLOOR_PRICE = 10;

const listEventsByCollection = async (collectionSlug, seconds, eventType) => {
  try {
    const response = await sdk.list_events_by_collection({
      after: Math.floor(Date.now() / 1000) - seconds,
      event_type: eventType,
      collection_slug: collectionSlug,
    });
    return response.data.asset_events;
  } catch (err) {
    logger.error(`Error in listEventsByCollection: ${err.message}`);
    throw err;
  }
};

const filterAssetEvents = (asset_events, name, symbol, event_type) => {
  return asset_events.filter(
    (asset_event) =>
      (event_type === SALE_TYPE
        ? asset_event.nft.name === name
        : asset_event.asset.name === name) &&
      asset_event.payment.symbol === symbol
  );
};

const getFloorPrice = async (collectionSlug, name = "") => {
  try {
    const asset_events = await listEventsByCollection(
      collectionSlug,
      TIME_INTERVAL_SALE,
      SALE_TYPE
    );

    const filteredEvents =
      name === ""
        ? asset_events
        : filterAssetEvents(asset_events, name, ETH_SYMBOL, SALE_TYPE);

    const countNfts = filteredEvents.slice(0, COUNT_FOR_FLOOR_PRICE).length;
    const sumPrices = filteredEvents
      .slice(0, COUNT_FOR_FLOOR_PRICE)
      .reduce(
        (accumulator, asset_event) =>
          accumulator + asset_event.payment.quantity,
        0
      );

    logger.info(`Count nfts: ${countNfts}`);
    logger.info(`Sum of nfts: ${sumPrices}(${sumPrices / 1e18}ETH)`);

    return sumPrices / countNfts;
  } catch (err) {
    logger.error(`Error in getFloorPrice: ${err.message}`);
    throw err;
  }
};

const getLastListedNftsByCollectionAndName = async (collection_slug, name) => {
  const listedNfts = await listEventsByCollection(
    collection_slug,
    TIME_INTERVAL_LIST,
    LISTING_TYPE
  );
  return filterAssetEvents(listedNfts, THE_ODYSSEY, ETH_SYMBOL, LISTING_TYPE);
};

const extractNftInfo = (nfts, floorPrice) => {
  return nfts.map((nft) => ({
    chain: nft.chain,
    contract: nft.asset.contract,
    identifier: nft.asset.identifier,
    name: nft.asset.name,
    maker: nft.maker,
    quantity: nft.payment.quantity,
    decimals: nft.payment.decimals,
    symbol: nft.payment.symbol,
    order_type: nft.order_type,
    priceInEth: nft.payment.quantity / 1e18,
    floorPercentage: ((nft.payment.quantity - floorPrice) * 100) / floorPrice,
    linkToBuy: `https://opensea.io/assets/${nft.chain}/${nft.asset.contract}/${nft.asset.identifier}`,
  }));
};

const main = async () => {
  const floorPrice = await getFloorPrice(ARBITRUM_ODYSSEY_NFT, THE_ODYSSEY);
  logger.info(`Floor Price: ${floorPrice}(${floorPrice / 1e18}ETH)`);

  const listedNfts = await getLastListedNftsByCollectionAndName(
    ARBITRUM_ODYSSEY_NFT,
    THE_ODYSSEY
  );
  const processedNfts = extractNftInfo(listedNfts, floorPrice);
  console.log(processedNfts);
};

main();
