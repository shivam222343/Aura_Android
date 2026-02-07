const CustomForm = require('../models/CustomForm');
const FormResponse = require('../models/FormResponse');

// Create a new form
exports.createForm = async (req, res) => {
    try {
        const formData = {
            ...req.body,
            createdBy: req.user.id
        };
        const form = new CustomForm(formData);
        await form.save();
        res.status(201).json({ success: true, data: form });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Get all forms for admin
exports.getAdminForms = async (req, res) => {
    try {
        const forms = await CustomForm.find({ createdBy: req.user.id }).sort('-createdAt');
        res.status(200).json({ success: true, data: forms });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Get a single form (for editing or viewing)
exports.getForm = async (req, res) => {
    try {
        const form = await CustomForm.findById(req.params.id);
        if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found' });
        }
        res.status(200).json({ success: true, data: form });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Update a form
exports.updateForm = async (req, res) => {
    try {
        const form = await CustomForm.findOneAndUpdate(
            { _id: req.params.id, createdBy: req.user.id },
            req.body,
            { new: true, runValidators: true }
        );
        if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found or unauthorized' });
        }
        res.status(200).json({ success: true, data: form });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Delete a form
exports.deleteForm = async (req, res) => {
    try {
        const form = await CustomForm.findOneAndDelete({ _id: req.params.id, createdBy: req.user.id });
        if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found or unauthorized' });
        }
        // Also delete responses
        await FormResponse.deleteMany({ formId: req.params.id });
        res.status(200).json({ success: true, message: 'Form deleted successfully' });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

// Submit a response
exports.submitResponse = async (req, res) => {
    try {
        const { formId, answers, email } = req.body;
        const form = await CustomForm.findById(formId);

        if (!form || form.status !== 'published') {
            return res.status(400).json({ success: false, message: 'Form is not accepting responses' });
        }

        // Check closed date
        if (form.settings.closeDate && new Date() > new Date(form.settings.closeDate)) {
            return res.status(400).json({ success: false, message: 'Form is closed' });
        }

        const response = new FormResponse({
            formId,
            submittedBy: req.user ? req.user.id : null,
            email: email || (req.user ? req.user.email : null),
            answers
        });

        await response.save();
        res.status(201).json({ success: true, data: response });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

// Get responses for a form (Admin only)
exports.getResponses = async (req, res) => {
    try {
        const form = await CustomForm.findOne({ _id: req.params.id, createdBy: req.user.id });
        if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found or unauthorized' });
        }

        const responses = await FormResponse.find({ formId: req.params.id }).sort('-submittedAt').populate('submittedBy', 'displayName email fullName');
        res.status(200).json({ success: true, data: responses });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};

exports.uploadFile = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ success: false, message: 'No file uploaded' });
        }

        const { uploadImageBuffer } = require('../config/cloudinary');
        const result = await uploadImageBuffer(req.file.buffer, 'aura/form-submissions');

        res.status(200).json({
            success: true,
            url: result.url,
            publicId: result.publicId
        });
    } catch (error) {
        console.error('Form Upload Error:', error);
        res.status(500).json({ success: false, message: 'Upload failed' });
    }
};
exports.getFormAnalytics = async (req, res) => {
    try {
        const form = await CustomForm.findOne({ _id: req.params.id, createdBy: req.user.id });
        if (!form) {
            return res.status(404).json({ success: false, message: 'Form not found or unauthorized' });
        }

        const responses = await FormResponse.find({ formId: req.params.id });
        const analytics = [];

        form.sections.forEach(section => {
            section.questions.forEach(q => {
                const questionData = {
                    id: q.id,
                    label: q.label,
                    type: q.type,
                    stats: {}
                };

                if (['radio', 'dropdown', 'checkbox'].includes(q.type)) {
                    responses.forEach(resp => {
                        const ans = resp.answers[q.id];
                        if (ans) {
                            const answersArray = Array.isArray(ans) ? ans : [ans];
                            answersArray.forEach(val => {
                                questionData.stats[val] = (questionData.stats[val] || 0) + 1;
                            });
                        }
                    });
                    analytics.push(questionData);
                } else if (q.type === 'number') {
                    const values = responses.map(resp => Number(resp.answers[q.id])).filter(v => !isNaN(v));
                    if (values.length > 0) {
                        questionData.stats = {
                            average: values.reduce((a, b) => a + b, 0) / values.length,
                            min: Math.min(...values),
                            max: Math.max(...values),
                            total: values.length
                        };
                        analytics.push(questionData);
                    }
                }
            });
        });

        res.status(200).json({ success: true, data: analytics, totalResponses: responses.length });
    } catch (error) {
        res.status(500).json({ success: false, message: error.message });
    }
};
