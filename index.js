const express = require('express');
const app = express();
const cors = require('cors');
const { MongoClient, ServerApiVersion } = require('mongodb');
const { ObjectId } = require('mongodb');
require('dotenv').config();
const { createRemoteJWKSet, jwtVerify } = require('jose-cjs');
const { default: axios } = require('axios');

const PORT = process.env.PORT || 5000;
const url = process.env.DATABASE_URL;
const FRONTEND_URL = process.env.LOCAL_FRONTEND_URL;

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


// ========== JWT Verification Middleware ==========
console.log("FRONTEND_URL:", FRONTEND_URL);

const JWKS = createRemoteJWKSet(
    new URL(`${FRONTEND_URL}/api/auth/jwks`)
);

const verifyToken = async (req, res, next) => {
    const authHeader = req?.headers?.authorization;

    if (!authHeader) {
        return res.status(401).json({ error: "Authorization access denied" });
    }
    const token = authHeader && authHeader.split(' ')[1];
    if (!token) {
        return res.status(401).json({ error: "Authorization access denied" });
    }


    try {
        const { payload } = await jwtVerify(token, JWKS,);
        req.user = payload;
        next();
    } catch (error) {
        return res.status(401).json({ error: "Forbidden" });
    }

};


// Test MongoDB connection
async function run() {
    try {
        const database = client.db('chaloticke');
        const usersDatabase = client.db('userInfo');
        const ticketsCollection = database.collection('tickets');
        const usersCollection = usersDatabase.collection('user');
        const bookedTicketsCollection = database.collection('bookedTickets');
        // ========== All Get APIs ==========

        app.get("/api/tickets/total-qty/:userId", verifyToken, async (req, res) => {
            try {
                const userId = req.params.userId;
                const ticketResult = await ticketsCollection.aggregate([
                    {
                        $match: {
                            vendorId: userId,
                            verificationStatus: "approved",
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalQty: { $sum: "$quantity" }
                        }
                    }
                ]).toArray();
                const bookedTicketResult = await bookedTicketsCollection.aggregate([{

                    $match: {
                        vendorId: userId,
                        status: { $in: ["pending", "accepted", "paid"] }
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalQty: { $sum: "$quantity" }
                    }
                }
                ]).toArray();

                const ticketTotalQty = ticketResult[0]?.totalQty || 0;
                const bookedTicketTotalQty = bookedTicketResult[0]?.totalQty || 0;

                res.send({
                    ticketTotalQty: ticketTotalQty + bookedTicketTotalQty,
                });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        // Get total tickets sold API
        app.get("/api/tickets/total-sold/:userId", verifyToken, async (req, res) => {
            try {
                const userId = req.params.userId;
                const result = await bookedTicketsCollection.aggregate([
                    {
                        $match: {
                            vendorId: userId,
                            status: { $in: ["paid"] }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalTicketsSold: { $sum: "$quantity" },
                            tickets: {
                                $push: {
                                    title: "$title",
                                    sales: "$price",
                                    type: "$transportType",
                                    seats: "$quantity"
                                }
                            }
                        }
                    }
                ]).toArray();

                const totalTicketsSold = result[0]?.totalTicketsSold || 0;
                res.send({ totalTicketsSold, tickets: result[0]?.tickets || [] });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        // Get total revenue API
        app.get("/api/tickets/total-revenue/:userId", verifyToken, async (req, res) => {
            try {
                const userId = req.params.userId;
                const result = await bookedTicketsCollection.aggregate([
                    {
                        $match: {
                            vendorId: userId,
                            status: { $in: ["paid"] }
                        }
                    },
                    {
                        $group: {
                            _id: null,
                            totalRevenue: { $sum: "$price" }
                        }
                    }
                ]).toArray();

                const totalRevenue = result[0]?.totalRevenue || 0;
                res.send({ totalRevenue });
            } catch (error) {
                res.status(500).send({ error: error.message });
            }
        });

        // Get monthly report API
        app.get("/api/monthly-report/:userId", verifyToken, async (req, res) => {
            try {
                const userId = req.params.userId;
                const report = await bookedTicketsCollection.aggregate([
                    {
                        $match: {
                            vendorId: userId
                        }
                    },
                    {
                        $group: {
                            _id: {
                                month: {
                                    $dateToString: {
                                        format: "%b",
                                        date: { $toDate: "$bookedAt" }
                                    }
                                }
                            },

                            // Total quantity added
                            ticketsAdded: {
                                $sum: "$quantity"
                            },

                            // Sold tickets (accepted/paid)
                            ticketsSold: {
                                $sum: {
                                    $cond: [
                                        { $in: ["$status", ["paid"]] },
                                        "$quantity",
                                        0
                                    ]
                                }
                            },

                            // Revenue
                            revenue: {
                                $sum: {
                                    $cond: [
                                        { $in: ["$status", ["paid"]] },
                                        "$price",
                                        0
                                    ]
                                }
                            }
                        }
                    },
                    {
                        $project: {
                            _id: 0,
                            month: "$_id.month",
                            ticketsAdded: 1,
                            ticketsSold: 1,
                            revenue: 1
                        }
                    }
                ]).toArray();

                res.status(200).json(report);
            } catch (error) {
                console.error("Error generating monthly report:", error);
                res.status(500).json({
                    message: "Internal Server Error"
                });
            }
        });

        // get tickets search API
        app.get("/api/tickets-search", async (req, res) => {
            try {
                const { from, to, transportType, sort } = req.query;
                console.log("Received search parameters:", { from, to, transportType, sort });

                let query = { verificationStatus: "approved" };

                if (from) {
                    query.from = { $regex: from, $options: "i" };
                }
                if (to) {
                    query.to = { $regex: to, $options: "i" };
                }
                if (transportType && transportType !== "all") {
                    query.transportType = { $regex: `^${transportType}$`, $options: "i" };
                }

                let sortOptions = {};
                if (sort === "price_asc") {
                    sortOptions.price = 1;
                } else if (sort === "price_desc") {
                    sortOptions.price = -1;
                }

                const tickets = await ticketsCollection.find(query).sort(sortOptions).toArray();

                res.status(200).json(tickets);
            } catch (error) {
                res.status(500).json({ message: "Server Error", error: error.message });
            }
        });

        // Get only vendor all tickets API
        app.get('/api/tickets', async (req, res) => {
            try {
                const email = req?.query?.email;
                const status = req?.query?.
                    verificationStatus;
                const isAdvertisement = req?.query?.isAdvertised;


                let query = {};
                if (email) {
                    query = { vendorEmail: email };
                }
                if (status) {
                    query = { verificationStatus: status };
                }
                if (isAdvertisement) {
                    query = { isAdvertised: isAdvertisement === 'true' };
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
        app.get('/api/users', verifyToken, async (req, res) => {
            try {

                const users = await usersCollection.find({}).toArray();
                res.status(200).json(users);
            } catch (error) {
                console.error('Error fetching users:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // Get user booked all tickets API
        app.get('/api/booked-tickets/:userId', verifyToken, async (req, res) => {
            try {
                const userId = req.params.userId;
                const quary = { userId: userId };
                const bookedTickets = await bookedTicketsCollection.find(quary).toArray();
                if (bookedTickets && bookedTickets.length > 0) {
                    return res.status(200).json(bookedTickets);
                } else {
                    return res.status(404).json({ message: 'Booked tickets not found' });
                }
            } catch (error) {
                console.error('Error fetching booked ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        //  booking request for vendor API
        app.get('/api/booked-tickets/vendor/:vendorId', verifyToken, async (req, res) => {
            try {
                const vendorId = req.params.vendorId;

                const bookedTickets = await bookedTicketsCollection.find({ vendorId: vendorId }).toArray();
                if (bookedTickets && bookedTickets.length > 0) {
                    return res.status(200).json(bookedTickets);
                } else {
                    return res.status(404).json({ message: 'Booked tickets not found' });
                }
            } catch (error) {
                console.error('Error fetching booked ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // ========== All Post APIs ==========

        // vendor ticket post API
        app.post('/api/tickets', verifyToken, async (req, res) => {
            try {
                const ticketData = req.body;
                const result = await ticketsCollection.insertOne(ticketData);
                if (!result.acknowledged) {
                    return res.status(500).json({ message: 'Failed to create ticket' });
                }
                if (result.acknowledged) {
                    axios.post(`${FRONTEND_URL}/api/revalidate`, { action: "added-ticket" }).catch((error) => {
                        console.error("Error revalidating cache:", error);
                    });
                }
                res.status(201).json({ message: 'Ticket created successfully', ticketId: result.insertedId });
            } catch (error) {
                console.error('Error creating ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });



        // ========== All Update APIs ==========

        // vendor ticket update API
        app.patch('/api/tickets/:id', verifyToken, async (req, res) => {
            try {
                const ticketId = req.params.id;
                const updatedData = req.body;
                const { quantity, ...restOfData } = updatedData;
                const result = await ticketsCollection.updateOne(
                    { _id: new ObjectId(ticketId) },
                    {
                        $set: restOfData,
                        $inc: { quantity: quantity ? parseInt(quantity) : 0 }
                    }
                );

                if (result.matchedCount === 1 && "isAdvertised" in updatedData) {
                    axios.post(`${FRONTEND_URL}/api/revalidate`, { isAdvertised: "isAdvertised" }).catch((error) => {
                        console.error("Error revalidating cache:", error);
                    });
                    res.status(200).json({ message: 'Ticket updated and advertised successfully' });
                } else {
                    res.status(404).json({ message: 'Ticket not found' });
                }
                if (result.matchedCount === 1 && "verificationStatus" in updatedData) {
                    axios.post(`${FRONTEND_URL}/api/revalidate`, { verificationStatus: "success" }).catch((error) => {
                        console.error("Error revalidating cache:", error);
                    });
                    res.status(200).json({ message: 'Ticket updated and verified successfully' });
                } else {
                    res.status(404).json({ message: 'Ticket not found' });
                }


                if (result.matchedCount === 1) {
                    axios.post(`${FRONTEND_URL}/api/revalidate`, { ticketUpdated: "ticket-updated" }).catch((error) => {
                        console.error("Error revalidating cache:", error);
                    });
                    res.status(200).json({ message: 'Ticket updated successfully' });
                } else {
                    res.status(404).json({ message: 'Ticket not found' });
                }
                return res.status(200).json({ message: 'Ticket updated and verified successfully' });
            } catch (error) {
                console.error('Error updating ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // make user role is admin, vendor, or user and if vendor is fraud.
        app.patch('/api/users/:id', verifyToken, async (req, res) => {
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


        // user booked ticket post API
        app.put('/api/tickets/booked/:id', verifyToken, async (req, res) => {
            const ticketId = req.params.id;
            const bookedTicketData = req.body.bookedData;
            const { _id, quantity, price, ...restOfData } = bookedTicketData;
            try {
                const result = await bookedTicketsCollection.updateOne(
                    { _id: new ObjectId(ticketId) },

                    {
                        $inc: {
                            quantity: parseInt(bookedTicketData.quantity),
                            price: parseFloat(bookedTicketData.price)
                        },
                        $set: restOfData
                    },
                    { upsert: true }
                );
                console.log("MongoDB Result:", result);
                res.status(200).json({ message: 'Booked ticket updated successfully', bookedTicketId: result.upsertedId || ticketId });
            } catch (error) {
                console.error('Error updating booked ticket:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // user booked ticket status update 
        app.patch('/api/tickets/booked/:id', verifyToken, async (req, res) => {
            try {
                const ticketId = req.params.id;
                const { status } = req.body;
                const result = await bookedTicketsCollection.updateOne(
                    { _id: new ObjectId(ticketId) },
                    { $set: { status } }
                );
                if (result.matchedCount === 1) {
                    res.status(200).json({ message: 'Booked ticket status updated successfully' });
                } else {
                    res.status(404).json({ message: 'Booked ticket not found' });
                }
            } catch (error) {
                console.error('Error updating booked ticket status:', error);
                res.status(500).json({ message: 'Internal server error' });
            }
        });

        // ========== All Delete APIs ==========

        // vendor ticket delete API
        app.delete('/api/tickets/:id', verifyToken, async (req, res) => {
            try {
                const ticketId = req.params.id;
                const result = await ticketsCollection.deleteOne({ _id: new ObjectId(ticketId) });
                if (result.deletedCount === 1) {
                    axios.post(`${FRONTEND_URL}/api/revalidate`, { deleteTicket: "delete-ticket" }).catch((error) => {
                        console.error("Error revalidating cache:", error);
                    });
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