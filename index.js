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
        const usersDatabase = client.db('userInfo');
        const ticketsCollection = database.collection('tickets');
        const usersCollection = usersDatabase.collection('user');
        // ========== All Get APIs ==========

        // Get only vendor all tickets API
        app.get('/api/tickets', async (req, res) => {
            try {
                const email = req?.query?.email;
                let query = {};
                if (email) {
                    query = { vendorEmail: email };
                }
                const tickets = await ticketsCollection.find(query).toArray();
                res.status(200).json(tickets);
            } catch (error) {
                console.error('Error fetching tickets:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Get single ticket API
        app.get('/api/tickets/:id', async (req, res) => {
            try {
                const ticketId = req.params.id;
                const ticket = await ticketsCollection.findOne({ _id: new ObjectId(ticketId) });
                if (ticket) {
                    res.status(200).json(ticket);
                } else {
                    res.status(404).json({ message: 'Ticket not found' });
                }
            } catch (error) {
                console.error('Error fetching ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Get all user Data API
        app.get('/api/users', async (req, res) => {
            try {

                const users = await usersCollection.find({}).toArray();
                res.status(200).json(users);
            } catch (error) {
                console.error('Error fetching users:', error);
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



        // ========== All Update APIs ==========

        // vendor ticket update API
        app.patch('/api/tickets/:id', async (req, res) => {
            try {
                const ticketId = req.params.id;
                const updatedData = req.body;
                const result = await ticketsCollection.updateOne(
                    { _id: new ObjectId(ticketId) },
                    { $set: updatedData }
                );
                if (result.matchedCount === 1) {
                    res.status(200).json({ message: 'Ticket updated successfully' });
                } else {
                    res.status(404).json({ message: 'Ticket not found' });
                }
            } catch (error) {
                console.error('Error updating ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // make user role is admin, vendor, or user and if vendor is fraud.
        app.patch('/api/users/:id', async (req, res) => {
            try {
                const userId = req.params.id;
                const updatedData = req.body;
                const result = await usersCollection.updateOne(
                    { _id: new ObjectId(userId) },
                    { $set: updatedData }
                );
                if (result.matchedCount === 1) {
                    res.status(200).json({ message: 'User role updated successfully' });
                } else {
                    res.status(404).json({ message: 'User not found' });
                }
            } catch (error) {
                console.error('Error updating user role:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });


        // ========== All Delete APIs ==========

        // vendor ticket delete API
        app.delete('/api/tickets/:id', async (req, res) => {
            try {
                const ticketId = req.params.id;
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