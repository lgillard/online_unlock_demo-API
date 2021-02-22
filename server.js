// Setup
const express = require('express');

const app = express();
app.use(function(req, res, next)
		{
			res.header('Access-Control-Allow-Origin', '*');
			res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept');
			next();
		});

const server = require('http').createServer(app);


const io = require('socket.io')(server, {
	cors: {
		origin: '*',
	},
});

const port = process.env.PORT || 3000;

server.listen(port, function()
{
	console.log('Server listening at port %d', port);
});


// Game

const buildCard  = name =>
{
	return { x: 100, y: 100, name: name, isBack: true, position: 1, rotation: 0 };
};
const buildParty = () =>
{
	return {
		cardsOnBoard: [], cardsOnPick: [], cardsOnDiscard: [], scenarioInProgress: '',
	};
};

// Card list by scenario
const scenarii = {
	demo: ['69',
		   '42',
		   '46',
		   '16',
		   '35',
		   '25',
		   '48',
		   '21',
		   '11'],
	christmas: ['2',
				'51',
				'5',
				'67',
				'14',
				'34',
				'39',
				'69',
				'42',
				'84',
				'92',
				'35',
				'93',
				'86',
				'50',
				'52',
				'63',
				'68',
				'72',
				'99',
				'19',
				'23',
				'78',
				'65',
				'97'],
	spirou: ['7',
			 '41',
			 '42',
			 '65',
			 '36',
			 '74',
			 '19',
			 '35',
			 '64',
			 '88',
			 '38',
			 '46',
			 '77',
			 '83',
			 '80',
			 '60',
			 '27',
			 '32',
			 '61',
			 '99'],
	ra: ['6',
		 '42',
		 '91',
		 'A',
		 'H',
		 '22',
		 '23',
		 '30',
		 '60',
		 '9',
		 '15',
		 '66',
		 '85',
		 '37',
		 '55',
		 '24',
		 '28',
		 '88',
		 'B',
		 '39',
		 '8',
		 '20',
		 'R'],
};
const parties  = {
	'': buildParty(),
};

io.on('connection', function(socket)
{
	let partyCode = '';
	socket.emit('SCENARIO_IN_PROGRESS', parties[partyCode].scenarioInProgress);
	if (parties[partyCode].scenarioInProgress !== '')
	{
		socket.emit('CARD_STACKS', { cardsOnBoard: parties[partyCode].cardsOnBoard, cardsOnPick: parties[partyCode].cardsOnPick, cardsOnDiscard: cardsOnDiscard });
	}

	socket.on('UPD_PARTY_CODE', ({ newPartyCode, saveParty }) =>
	{
		if (partyCode === newPartyCode)
		{
			return;
		}

		// Leave and remove party if necessary
		socket.leave(partyCode);
		oldRoomClients = io.sockets.adapter.rooms[partyCode];
		if (!saveParty && oldRoomClients !== undefined && oldRoomClients.length < 1)
		{
			parties[partyCode] = undefined;
		}

		// Join new party
		partyCode = newPartyCode;
		socket.join(newPartyCode);
		if (parties[partyCode] === undefined)
		{
			parties[partyCode] = buildParty();
		}
		else
		{
			socket.emit('SCENARIO_IN_PROGRESS', parties[partyCode].scenarioInProgress);
			socket.emit('CARD_STACKS', {
				cardsOnBoard: parties[partyCode].cardsOnBoard, cardsOnPick: parties[partyCode].cardsOnPick, cardsOnDiscard: parties[partyCode].cardsOnDiscard,
			});
		}
	});

	socket.on('ABANDON_CURRENT_GAME', () =>
	{
		io.to(partyCode).emit('ABANDON_CURRENT_GAME');
		parties[partyCode].scenarioInProgress = '';
		parties[partyCode].cardsOnBoard       = [];
		parties[partyCode].cardsOnDiscard     = [];
		parties[partyCode].cardsOnPick        = [];
	});

	socket.on('SCENARIO_CHOSEN', scenarioChosen =>
	{
		parties[partyCode].scenarioInProgress = scenarioChosen;

		// Init stacks
		parties[partyCode].cardsOnDiscard = [];
		parties[partyCode].cardsOnPick    = [];
		for (const cardName of scenarii[parties[partyCode].scenarioInProgress])
		{
			parties[partyCode].cardsOnPick.push(buildCard(cardName));
		}
		parties[partyCode].cardsOnBoard = [buildCard('start')];

		// Notify clients
		io.to(partyCode).emit('SCENARIO_IN_PROGRESS', parties[partyCode].scenarioInProgress);
		io.to(partyCode).emit('CARD_STACKS', {
			cardsOnBoard: parties[partyCode].cardsOnBoard, cardsOnPick: parties[partyCode].cardsOnPick, cardsOnDiscard: parties[partyCode].cardsOnDiscard,
		});
	});

	socket.on('CARD_RETURNED', function({ name, isBack })
	{
		for (const card of parties[partyCode].cardsOnBoard)
		{
			if (card.name === name)
			{
				card.isBack = isBack;

				io.to(partyCode).emit('CARD_RETURNED_' + name, isBack);
				return;
			}
		}
	});

	socket.on('CARD_FROM_PICK_TO_BOARD', cardName =>
	{
		moveCardIntoStack(parties[partyCode].cardsOnPick, parties[partyCode].cardsOnBoard, cardName, partyCode);
	});

	socket.on('CARD_FROM_BOARD_TO_PICK', cardName =>
	{
		moveCardIntoStack(parties[partyCode].cardsOnBoard, parties[partyCode].cardsOnPick, cardName, partyCode);
	});

	socket.on('CARD_FROM_BOARD_TO_DISCARD', cardName =>
	{
		moveCardIntoStack(parties[partyCode].cardsOnBoard, parties[partyCode].cardsOnDiscard, cardName, partyCode);
	});

	socket.on('CARD_FROM_DISCARD_TO_BOARD', cardName =>
	{
		moveCardIntoStack(parties[partyCode].cardsOnDiscard, parties[partyCode].cardsOnBoard, cardName, partyCode);
	});

	socket.on('CARD_MOVED', ({ name, x, y, position }) =>
	{
		for (const card of parties[partyCode].cardsOnBoard)
		{
			if (card.name === name)
			{
				card.x        = x;
				card.y        = y;
				card.position = parties[partyCode].cardsOnBoard.length;
			}
			else if (card.position >= position)
			{
				card.position = card.position - 1;
			}
		}
		const result = { cardsOnBoard: parties[partyCode].cardsOnBoard, cardsOnPick: parties[partyCode].cardsOnPick, cardsOnDiscard: parties[partyCode].cardsOnDiscard };
		io.to(partyCode).emit('CARD_STACKS', result);
	});

	socket.on('CARD_ROTATE', ({ name, rotation }) =>
	{
		for (const card of parties[partyCode].cardsOnBoard)
		{
			if (card.name === name)
			{
				card.rotation = (rotation + card.rotation + 360) % 360;
				io.to(partyCode).emit('CARD_' + name + '_TURN', card.rotation);
			}
		}
	});
});

const moveCardIntoStack = (from, to, cardName, partyCode) =>
{
	// TODO: improve => change array to key/value array
	for (let key = 0; key < from.length; key ++)
	{
		if (cardName === from[key].name)
		{
			const card    = from[key];
			card.x        = 100;
			card.y        = 100;
			card.rotation = 0;
			card.isBack   = true;
			card.position = 1;
			to.push(card);
			from.splice(key, 1);

			const result = { cardsOnBoard: parties[partyCode].cardsOnBoard, cardsOnPick: parties[partyCode].cardsOnPick, cardsOnDiscard: parties[partyCode].cardsOnDiscard };
			io.to(partyCode).emit('CARD_STACKS', result);
			return;
		}
	}
};
