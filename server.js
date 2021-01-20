const express = require('express');

const app = express();
app.use(function(req, res, next) {
	res.header("Access-Control-Allow-Origin", "*");
	res.header("Access-Control-Allow-Headers", "Origin, X-Requested-With, Content-Type, Accept");
	next();
});

const server = app.listen(3001, function()
{
	console.log('server running on port 3001');
});

const io = require('socket.io')(server, {
	cors: {
		origin: '*',
	},
});

const buildCard = name =>
{
	return { x: 100, y: 100, name: name, isBack: true, position: 1, rotation: 0 };
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

let cardsOnBoard       = [];
let cardsOnPick        = [];
let cardsOnDiscard     = [];
let scenarioInProgress = '';

io.on('connection', function(socket)
{
	socket.emit('SCENARIO_IN_PROGRESS', scenarioInProgress);
	if (scenarioInProgress !== '')
	{
		socket.emit('CARD_STACKS', { cardsOnBoard: cardsOnBoard, cardsOnPick: cardsOnPick, cardsOnDiscard: cardsOnDiscard });
	}

	socket.on('ABANDON_CURRENT_GAME', () =>
	{
		io.emit('ABANDON_CURRENT_GAME');
		scenarioInProgress = '';
		cardsOnBoard       = [];
		cardsOnDiscard     = [];
		cardsOnPick        = [];
	});

	socket.on('SCENARIO_CHOSEN', scenarioChosen =>
	{
		scenarioInProgress = scenarioChosen;

		// Init stacks
		cardsOnDiscard = [];
		cardsOnPick    = [];
		for (const cardName of scenarii[scenarioInProgress])
		{
			cardsOnPick.push(buildCard(cardName));
		}
		cardsOnBoard = [buildCard('start')];

		// Notify clients
		io.emit('SCENARIO_IN_PROGRESS', scenarioInProgress);
		io.emit('CARD_STACKS', { cardsOnBoard: cardsOnBoard, cardsOnPick: cardsOnPick, cardsOnDiscard: cardsOnDiscard });
	});

	socket.on('CARD_RETURNED', function({ name, isBack })
	{
		for (const card of cardsOnBoard)
		{
			if (card.name === name)
			{
				card.isBack = isBack;

				io.emit('CARD_RETURNED_' + name, isBack);
				return;
			}
		}
	});

	socket.on('CARD_FROM_PICK_TO_BOARD', cardName =>
	{
		moveCardIntoStack(cardsOnPick, cardsOnBoard, cardName);
	});

	socket.on('CARD_FROM_BOARD_TO_PICK', cardName =>
	{
		moveCardIntoStack(cardsOnBoard, cardsOnPick, cardName);
	});

	socket.on('CARD_FROM_BOARD_TO_DISCARD', cardName =>
	{
		moveCardIntoStack(cardsOnBoard, cardsOnDiscard, cardName);
	});

	socket.on('CARD_FROM_DISCARD_TO_BOARD', cardName =>
	{
		moveCardIntoStack(cardsOnDiscard, cardsOnBoard, cardName);
	});

	socket.on('CARD_MOVED', ({ name, x, y, position }) =>
	{
		for (const card of cardsOnBoard)
		{
			if (card.name === name)
			{
				card.x        = x;
				card.y        = y;
				card.position = cardsOnBoard.length;

				io.emit('CARD_' + name + '_MOVED', card);
			}
			else if (card.position > position)
			{
				card.position = card.position - 1;
			}
		}
		io.emit('CARD_GO_FRONT', { name, position });
	});

	socket.on('CARD_ROTATE', ({ name, rotation }) =>
	{
		for (const card of cardsOnBoard)
		{
			if (card.name === name)
			{
				card.rotation = (rotation + card.rotation + 360) % 360;
				io.emit('CARD_' + name + '_TURN', card.rotation);
			}
		}
	});
});

const hasBeenInit = function()
{
	return cardsOnBoard.length + cardsOnPick.length + cardsOnDiscard.length > 0;
};

const moveCardIntoStack = (from, to, cardName) =>
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

			const result = { cardsOnBoard: cardsOnBoard, cardsOnPick: cardsOnPick, cardsOnDiscard: cardsOnDiscard };
			io.emit('CARD_STACKS', result);
			return;
		}
	}
};
