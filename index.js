const express = require("express");
const app = express();

const dbName = "travel";
const dbCollections = ["records"];
const mongojs = require("mongojs");
const db = mongojs(dbName, dbCollections);

const bodyParser = require("body-parser");

const { body, params, validationResult, param } = require("express-validator");
const { json } = require("body-parser");

app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// JWT 
const jwt = require("jsonwebtoken");
const { response } = require("express");
const secret = "You Only Live Once";


// Helper function 
const users = [
    { username: "Alice", password: "password", role: "user" },
    { username: "Bob", password: "password", role: "admin" },
]

function auth(req, res, next) {
    const authHeader = req.headers['authorization'];
    if (!authHeader) return res.sendStatus(401);

    const [type, token] = authHeader.split(" ");

    if (type !== "Bearer") return res.sendStatus(401);

    jwt.verify(token, secret, function (err, data) {
        if (err) return res.sendStatus(401);
        else next();
    })
}

function onlyAdmin(req, res, next) {
    const [type, token] = req.headers['authorization'].split(" ");

    jwt.verify(token, secret, function (err, user) {
        if (user.role === 'admin') next();
        else return res.sendStatus(403);
    })
}

app.post("/api/login", function (req, res) {
    const { username, password } = req.body;

    const user = users.find(function (u) {
        return u.username === username && u.password === password;
    });

    if (user) {
        jwt.sign(user, secret, {
            expiresIn: "1h",
        }, function (err, token) {
            return res.status(200).json({ token });
        })
    } else {
        return res.sendStatus(401);
    }
})

// localhost:8000/api/records?filter[to]=Yangon&sort[name]=1&page=1
// test
app.get("/api/records", auth, function (req, res) {
    const options = req.query;

    const sort = options.sort || {};
    const filter = options.filter || {};
    const limit = 10;
    const page = parseInt(options.page);
    const skip = (page - 1) * limit;

    for (i in sort) {
        sort[i] = parseInt(sort[i]);
    }

    db.records
        .find(filter)
        .sort(sort)
        .skip(skip)
        .limit(limit, function (err, data) {
            if (err) {
                return res.sendStatus(500);
            } else {
                return res.status(200).json({
                    meta: {
                        skip,
                        limit,
                        sort,
                        filter,
                        page,
                        total: data.length,
                    },
                    data,
                    links: {
                        self: req.originalUrl,
                    },
                });
            }
        });
});

app.post("/api/records", auth,
    [
        body("name").not().isEmpty(),
        body("from").not().isEmpty(),
        body("to").not().isEmpty(),
    ],
    function (req, res) {
        const errors = validationResult(req);

        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        db.records.insert(req.body, function (err, data) {
            if (err) {
                return res.status(500);
            }

            const _id = data._id;

            res.append("Location", "/api/records/" + _id);
            return res.status(201).json({ meta: { _id }, data });
        });
    }
);

app.put("/api/records/:id", auth,
    [
        param("id").isMongoId(),
        body("name").not().isEmpty(),
        body("from").not().isEmpty(),
        body("to").not().isEmpty(),
    ],
    function (req, res) {
        const _id = req.params.id;

        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array() });
        }

        db.records.count(
            {
                _id: mongojs.ObjectId(_id),
            },
            function (err, count) {
                if (count) {
                    const record = {
                        _id: mongojs.ObjectId(_id),
                        ...req.body,
                    };

                    db.records.save(record, function (err, data) {
                        return res.status(200).json({
                            meta: { _id },
                            data,
                        });
                    });
                } else {
                    db.records.save(req.body, function (err, data) {
                        return res.status(201).json({
                            meta: { _id: data._id },
                            data,
                        });
                    });
                }
            }
        );
    }
);

app.patch("/api/records/:id", auth, function (req, res) {
    const _id = req.params.id;

    db.records.count(
        {
            _id: mongojs.ObjectId(_id),
        },
        function (err, count) {
            if (count) {
                db.records.update(
                    { _id: mongojs.ObjectId(_id) },
                    { $set: req.body },
                    { multi: false },
                    function (err, data) {
                        db.records.find(
                            {
                                _id: mongojs.ObjectId(_id),
                            },
                            function (err, data) {
                                return res.status(200).json({
                                    meta: { _id },
                                    data,
                                });
                            }
                        );
                    }
                );
            } else {
                return res.sendStatus(404);
            }
        }
    );
});


app.delete("/api/records/:id", auth, onlyAdmin, function (req, res) {
    const _id = req.params.id;

    db.records.count({
        _id: mongojs.ObjectId(_id)
    }, function (err, count) {
        if (count) {
            db.records.remove({
                _id: mongojs.ObjectId(_id)
            }, function (err, data) {
                return res.sendStatus(204);
            })
        } else {
            return res.sendStatus(404);
        };
    })

})


// localhost:8000/test?sort[name]=1&filter[from]=Yangon&filter[to]=Yangon&page=2  //query test
app.get("/test", function (req, res) {
    return res.json(req.query);
});

app.listen(8000, () => {
    console.log("Server running at port 8000...");
});
