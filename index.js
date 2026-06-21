const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
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
        // ========== All Get APIs ==========

        // Get all tickets API
        app.get('/api/tickets', async (req, res) => {
            try {
                const query = req?.query?.email;
                console.log("Fetching tickets for email:", query); // ডিবাগিংয়ের জন্য লগ করা হচ্ছে
                if (!query) {
                    return res.status(400).json({ message: 'Email query parameter is required' });
                }
                const tickets = await ticketsCollection.find({ vendorEmail: query }).toArray();
                console.log(tickets)
                res.status(200).json(tickets);
            } catch (error) {
                console.error('Error fetching tickets:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // ========== All Post APIs ==========

        // vendor ticket post API
        app.post('/api/tickets', async (req, res) => {
            try {
                const ticketData = req.body;
                const result = await ticketsCollection.insertOne(ticketData);
                res.status(201).json({ message: 'Ticket created successfully', ticketId: result.insertedId });
            } catch (error) {
                console.error('Error creating ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        // ========== All Delete APIs ==========

        // vendor ticket delete API
        app.delete('/api/tickets/:id', async (req, res) => {
            try {
                const ticketId = req.params.id;
                console.log("Deleting ticket with ID:", ticketId); // ডিবাগিংয়ের জন্য লগ করা হচ্ছে
                const result = await ticketsCollection.deleteOne({ _id: new ObjectId(ticketId) });
                if (result.deletedCount === 1) {
                    res.status(200).json({ message: 'Ticket deleted successfully' });
                } else {
                    res.status(404).json({ message: 'Ticket not found' });
                }
            } catch (error) {
                console.error('Error deleting ticket:', error);
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