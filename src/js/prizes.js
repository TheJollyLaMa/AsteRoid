const COLLECTION = '0xe63EC9f8228720bAAC2fD528C0A6d06B3Dc5439B';
const ESCROW = '0x31b07b83e99A9bdF379bf40225b8A80d3804C89d';
const PRIZES = {
    1: [
        { project: 'DecentHead', version: '2.0.0', tokenId: 70, label: 'DecentHead v2.0.0 #70', metadataURI: 'ipfs://QmVGmpz63TS9XkTHMxf2sybHv5k9Vdoyr2Spi9QqZ4pzfj' },
        { project: 'DecentMarket', version: '0.3.1', tokenId: 71, label: 'DecentMarket v0.3.1 #71', metadataURI: 'ipfs://QmUR29d2NeRH94ceLDxHqDvDi4eNdSRTNM1wZ6UPDsvWqi' }
    ],
    2: [
        { project: 'DecentCalendar', version: '0.1.0', tokenId: 77, label: 'DecentCalendar v0.1.0 #77', metadataURI: 'ipfs://QmPqCy2g53t4BaffprtfjfM4L5imACB1nWZK63HyN9o3Tj' },
        { project: 'DecentPilgrimages', version: '0.1.1', tokenId: 78, label: 'DecentPilgrimages v0.1.1 #78', metadataURI: 'ipfs://QmNe9SYSyrZYV66X29Wp4hBLbCDpQDjnJsAJLDdAytALEN' },
        { project: 'DecentCanopy', version: '0.1.0', tokenId: 79, label: 'DecentCanopy v0.1.0 #79', metadataURI: 'ipfs://QmQqQtuSeab78F3pdBcMbvSopYZLa51zJ4JxcodQ2ugy9d' }
    ]
};
const MARATHON_PRIZE = {
    project: 'DecentVoyager', version: '1.0.0', tokenId: 80,
    label: 'DecentVoyager v1.0.0 #80',
    metadataURI: 'ipfs://QmacnQSJCxmqjWnMxDqhkLXCJv1zqp1EKoeF7nY782rGpe'
};
const PERFECT_PRIZES = {
    ace: { project: 'DecentBusking', version: '1.0.0', tokenId: 75, label: 'DecentBusking v1.0.0 #75', metadataURI: 'ipfs://QmZroFCEhaKoctVqW682Uzv5i6WWiQtuWvTAYkQBYfH6TD' },
    pilot: { project: 'BigNuten_Vanilla', version: '3.3.0', tokenId: 76, label: 'BigNuten_Vanilla v3.3.0 #76', metadataURI: 'ipfs://QmSrAwCU5p1ga3RzpuDHZxezsNjob76ZSFpRzCuG15yYqU' }
};
const PILOT_BONUS = { chainId: 8453, token: '0x25ACb773159Af5a5c672DEfe31C7Fff6a9A93736', symbol: 'BNUT', decimals: 18, amount: '100000000000000000000' };
module.exports = { COLLECTION, ESCROW, PRIZES, MARATHON_PRIZE, PERFECT_PRIZES, PILOT_BONUS };
