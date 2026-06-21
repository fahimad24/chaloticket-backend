const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const url = process.env.DATABASE_URL;

// Middleware
app.use(cors());
app.use(express.json());

// Connect to MongoDB
const client = new MongoClient(url, {
    serverApi: {
        version: ServerApiVersion.v1,
        strict: true,
        deprecationErrors: true,
    }
});


// Test MongoDB connection
async function run() {
    try {
        const database = client.db('chaloticke');
        const ticketsCollection = database.collection('tickets');

        // ========== All Post APIs ==========

        // vendor ticket post API
        app.post('/api/tickets', async (req, res) => {
            try {
                const ticketData = req.body;
                const result = await ticketsCollection.insertOne(ticketData);
                console.log('Ticket created with ID:', result.insertedId);
                res.status(201).json({ message: 'Ticket created successfully', ticketId: result.insertedId });
            } catch (error) {
                console.error('Error creating ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        // ========== MongoDB Connection ==========
        await client.connect();
        await client.db("admin").command({ ping: 1 });
        console.log("Pinged your deployment. You successfully connected to MongoDB!");
    } finally {
        // await client.close();
    }
}
run().catch(console.dir);



// Routes
app.get('/', (req, res) => {
    res.send('Welcome to Chaloticke Backend!');
});

// Start the server
app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});